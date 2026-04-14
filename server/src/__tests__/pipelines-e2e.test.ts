import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  companies,
  createDb,
  issues,
  pipelineRunSteps,
  pipelineRuns,
  pipelineSteps,
  pipelines,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { pipelineRoutes } from "../routes/pipelines.js";
import { errorHandler } from "../middleware/index.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres pipeline e2e tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("pipeline routes end-to-end", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-pipelines-e2e-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    // Delete in FK-safe order (cascade handles pipeline_steps/runs/run_steps via pipelines)
    await db.delete(pipelineRunSteps);
    await db.delete(pipelineRuns);
    await db.delete(pipelineSteps);
    await db.delete(pipelines);
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  function createApp(actor: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = actor;
      next();
    });
    app.use("/api", pipelineRoutes(db));
    app.use(errorHandler);
    return app;
  }

  async function seedFixture() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const projectId = randomUUID();
    const userId = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip Test Co",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "TestAgent",
      role: "engineer",
      status: "active",
      adapterType: "claude_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Test Project",
      status: "in_progress",
    });

    return { companyId, agentId, projectId, userId, issuePrefix };
  }

  function boardActor(userId: string, companyId: string) {
    return {
      type: "board",
      userId,
      source: "session",
      isInstanceAdmin: false,
      companyIds: [companyId],
    };
  }

  // ─── PIPELINE CRUD ───────────────────────────────────────────────────────────

  describe("POST /companies/:companyId/pipelines", () => {
    it("creates a pipeline and returns 201 with default draft status", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Release Workflow", description: "Deploy and QA" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Release Workflow");
      expect(res.body.description).toBe("Deploy and QA");
      expect(res.body.status).toBe("draft");
      expect(res.body.companyId).toBe(companyId);
      expect(res.body.id).toBeTruthy();
    });

    it("returns 400 when name is missing", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 400 when name is empty string", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "" });

      expect(res.status).toBe(400);
    });

    it("returns 403 when user does not belong to the company", async () => {
      const { companyId } = await seedFixture();
      const outsiderId = randomUUID();
      const app = createApp({ type: "board", userId: outsiderId, source: "session", isInstanceAdmin: false, companyIds: [] });

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Forbidden" });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /companies/:companyId/pipelines", () => {
    it("lists all pipelines for the company ordered by creation", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      await request(app).post(`/api/companies/${companyId}/pipelines`).send({ name: "Pipeline A" });
      await request(app).post(`/api/companies/${companyId}/pipelines`).send({ name: "Pipeline B" });

      const res = await request(app).get(`/api/companies/${companyId}/pipelines`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((p: any) => p.name)).toEqual(expect.arrayContaining(["Pipeline A", "Pipeline B"]));
    });

    it("does not return pipelines from other companies", async () => {
      const fixture1 = await seedFixture();
      const fixture2 = await seedFixture();
      const app1 = createApp(boardActor(fixture1.userId, fixture1.companyId));

      await request(app1)
        .post(`/api/companies/${fixture1.companyId}/pipelines`)
        .send({ name: "Company 1 Only" });

      const app2 = createApp(boardActor(fixture2.userId, fixture2.companyId));
      const res = await request(app2).get(`/api/companies/${fixture2.companyId}/pipelines`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe("GET /companies/:companyId/pipelines/:pipelineId", () => {
    it("returns pipeline detail with its steps", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const createRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Detail Pipeline" });
      const pipelineId = createRes.body.id as string;

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Step One", agentId, assigneeType: "agent" });

      const res = await request(app).get(`/api/companies/${companyId}/pipelines/${pipelineId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(pipelineId);
      expect(res.body.steps).toHaveLength(1);
      expect(res.body.steps[0].name).toBe("Step One");
    });

    it("returns 404 for a pipeline that does not exist", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const res = await request(app).get(`/api/companies/${companyId}/pipelines/${randomUUID()}`);

      expect(res.status).toBe(404);
    });

    it("returns 404 when pipeline belongs to a different company", async () => {
      const fixture1 = await seedFixture();
      const fixture2 = await seedFixture();
      const app1 = createApp(boardActor(fixture1.userId, fixture1.companyId));
      const app2 = createApp(boardActor(fixture2.userId, fixture2.companyId));

      const createRes = await request(app1)
        .post(`/api/companies/${fixture1.companyId}/pipelines`)
        .send({ name: "Private" });

      // Company 2 tries to access company 1's pipeline
      const res = await request(app2).get(
        `/api/companies/${fixture2.companyId}/pipelines/${createRes.body.id}`,
      );

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /companies/:companyId/pipelines/:pipelineId", () => {
    it("updates pipeline name, description, and status", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const createRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Old Name" });
      const pipelineId = createRes.body.id as string;

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}`)
        .send({ name: "New Name", status: "active" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("New Name");
      expect(res.body.status).toBe("active");
    });

    it("returns 404 for non-existent pipeline", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${randomUUID()}`)
        .send({ name: "Ghost" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /companies/:companyId/pipelines/:pipelineId", () => {
    it("deletes a pipeline and it no longer appears in detail or list", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const createRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "To Delete" });
      const pipelineId = createRes.body.id as string;

      const deleteRes = await request(app).delete(
        `/api/companies/${companyId}/pipelines/${pipelineId}`,
      );
      expect(deleteRes.status).toBe(204);

      const getRes = await request(app).get(
        `/api/companies/${companyId}/pipelines/${pipelineId}`,
      );
      expect(getRes.status).toBe(404);

      const listRes = await request(app).get(`/api/companies/${companyId}/pipelines`);
      expect(listRes.body).toHaveLength(0);
    });
  });

  // ─── STEP MANAGEMENT ─────────────────────────────────────────────────────────

  describe("POST /companies/:companyId/pipelines/:pipelineId/steps", () => {
    it("creates an action step with agent assignee", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Agent Step Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Build", agentId, assigneeType: "agent", positionX: 100, positionY: 200 });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Build");
      expect(res.body.agentId).toBe(agentId);
      expect(res.body.assigneeType).toBe("agent");
      expect(res.body.positionX).toBe(100);
      expect(res.body.positionY).toBe(200);
      expect(res.body.stepType).toBe("action");
    });

    it("creates a step with user assignee", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "User Step Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Human Review", assigneeType: "user", assigneeUserId: userId });

      expect(res.status).toBe(201);
      expect(res.body.assigneeType).toBe("user");
      expect(res.body.assigneeUserId).toBe(userId);
    });

    it("creates an if_else step without an assignee", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "IfElse Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({
          name: "Branch Gate",
          stepType: "if_else",
          config: {
            branches: [
              { id: "b1", label: "Done", condition: { field: "status", operator: "eq", value: "done" }, nextStepIds: [] },
              { id: "b2", label: "Else", condition: null, nextStepIds: [] },
            ],
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.stepType).toBe("if_else");
      expect(res.body.assigneeType).toBeNull();
    });

    it("creates a step with dependsOn linking to a previous step", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Deps Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const step1Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Step A", agentId, assigneeType: "agent", position: 0 });

      const step2Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Step B", agentId, assigneeType: "agent", position: 1, dependsOn: [step1Res.body.id] });

      expect(step2Res.status).toBe(201);
      expect(step2Res.body.dependsOn).toContain(step1Res.body.id);
    });

    it("returns 400 when assigneeType is 'agent' but agentId is missing", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Validation Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Bad Step", assigneeType: "agent" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when assigneeType is 'user' but assigneeUserId is missing", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Validation Pipeline 2" });
      const pipelineId = pipelineRes.body.id as string;

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Bad Step", assigneeType: "user" });

      expect(res.status).toBe(400);
    });

    it("returns 404 when pipeline does not exist", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${randomUUID()}/steps`)
        .send({ name: "Ghost Step", agentId, assigneeType: "agent" });

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /companies/:companyId/pipelines/:pipelineId/steps/:stepId", () => {
    it("updates step name and canvas position", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Update Step Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const stepRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Old Name", agentId, assigneeType: "agent" });
      const stepId = stepRes.body.id as string;

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/${stepId}`)
        .send({ name: "New Name", positionX: 50, positionY: 75 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("New Name");
      expect(res.body.positionX).toBe(50);
      expect(res.body.positionY).toBe(75);
    });

    it("returns 400 when switching to agent assignee without agentId", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Update Validation" });
      const pipelineId = pipelineRes.body.id as string;

      const stepRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "User Step", assigneeType: "user", assigneeUserId: userId });
      const stepId = stepRes.body.id as string;

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/${stepId}`)
        .send({ assigneeType: "agent" }); // no agentId provided

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /companies/:companyId/pipelines/:pipelineId/steps/:stepId", () => {
    it("removes a step and it disappears from pipeline detail", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Step Delete Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const stepRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Ephemeral Step", agentId, assigneeType: "agent" });
      const stepId = stepRes.body.id as string;

      const deleteRes = await request(app).delete(
        `/api/companies/${companyId}/pipelines/${pipelineId}/steps/${stepId}`,
      );
      expect(deleteRes.status).toBe(204);

      const detailRes = await request(app).get(
        `/api/companies/${companyId}/pipelines/${pipelineId}`,
      );
      expect(detailRes.body.steps).toHaveLength(0);
    });
  });

  describe("PATCH /companies/:companyId/pipelines/:pipelineId/steps/positions", () => {
    it("batch updates canvas positions and persists them", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Positions Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const step1Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Node A", agentId, assigneeType: "agent" });
      const step2Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Node B", agentId, assigneeType: "agent" });

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/positions`)
        .send({
          positions: [
            { stepId: step1Res.body.id, positionX: 10, positionY: 20 },
            { stepId: step2Res.body.id, positionX: 300, positionY: 400 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(2);

      const detail = await request(app).get(
        `/api/companies/${companyId}/pipelines/${pipelineId}`,
      );
      const nodeA = detail.body.steps.find((s: any) => s.id === step1Res.body.id);
      const nodeB = detail.body.steps.find((s: any) => s.id === step2Res.body.id);
      expect(nodeA.positionX).toBe(10);
      expect(nodeA.positionY).toBe(20);
      expect(nodeB.positionX).toBe(300);
      expect(nodeB.positionY).toBe(400);
    });

    it("returns 400 when positions array is empty", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Empty Pos Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const res = await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/positions`)
        .send({ positions: [] });

      expect(res.status).toBe(400);
    });
  });

  // ─── CREATE FROM ISSUES ───────────────────────────────────────────────────────

  describe("POST /companies/:companyId/pipelines/from-issues", () => {
    it("creates a pipeline from issues with sequential dependsOn chain", async () => {
      const { companyId, projectId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const [issue1] = await db
        .insert(issues)
        .values({ companyId, projectId, title: "Issue Alpha", status: "todo", priority: "high" })
        .returning();
      const [issue2] = await db
        .insert(issues)
        .values({ companyId, projectId, title: "Issue Beta", status: "todo", priority: "medium" })
        .returning();

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/from-issues`)
        .send({ name: "From Issues", issueIds: [issue1.id, issue2.id] });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("From Issues");
      expect(res.body.steps).toHaveLength(2);

      const [s1, s2] = res.body.steps as any[];
      expect(s1.name).toBe("Issue Alpha");
      expect(s1.issueId).toBe(issue1.id);
      expect(s1.dependsOn).toEqual([]);

      expect(s2.name).toBe("Issue Beta");
      expect(s2.issueId).toBe(issue2.id);
      expect(s2.dependsOn).toContain(s1.id);
    });

    it("inherits assignee from the issue", async () => {
      const { companyId, agentId, projectId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const [issue] = await db
        .insert(issues)
        .values({
          companyId,
          projectId,
          title: "Agent Issue",
          status: "todo",
          priority: "high",
          assigneeAgentId: agentId,
        })
        .returning();

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/from-issues`)
        .send({ name: "Assigned Pipeline", issueIds: [issue.id] });

      expect(res.status).toBe(201);
      expect(res.body.steps[0].agentId).toBe(agentId);
      expect(res.body.steps[0].assigneeType).toBe("agent");
    });

    it("returns 400 when an issue does not belong to the company", async () => {
      const fixture1 = await seedFixture();
      const fixture2 = await seedFixture();
      const app = createApp(boardActor(fixture1.userId, fixture1.companyId));

      // Create issue in company 2
      const [foreignIssue] = await db
        .insert(issues)
        .values({
          companyId: fixture2.companyId,
          projectId: fixture2.projectId,
          title: "Foreign Issue",
          status: "todo",
          priority: "low",
        })
        .returning();

      const res = await request(app)
        .post(`/api/companies/${fixture1.companyId}/pipelines/from-issues`)
        .send({ name: "Bad Pipeline", issueIds: [foreignIssue.id] });

      expect(res.status).toBe(400);
    });

    it("returns 400 when issueIds is empty", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/from-issues`)
        .send({ name: "Empty Issues", issueIds: [] });

      expect(res.status).toBe(400);
    });
  });

  // ─── PIPELINE EXECUTION ───────────────────────────────────────────────────────

  describe("POST /companies/:companyId/pipelines/:pipelineId/run", () => {
    it("returns 400 when pipeline has no steps", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Empty Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no steps/i);
    });

    it("returns 400 when an action step has no assignee", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Unassigned Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      // Insert step directly without assigneeType
      await db.insert(pipelineSteps).values({
        pipelineId,
        name: "Orphan Step",
        config: {},
        dependsOn: [],
      });

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assignee/i);
    });

    it("allows triggering with an if_else step that has no assignee", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "IfElse Run Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      // Action step (root)
      const step1Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Root Action", agentId, assigneeType: "agent", position: 0 });

      // If/else step depends on step1
      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({
          name: "Branch Gate",
          stepType: "if_else",
          dependsOn: [step1Res.body.id],
          position: 1,
          config: {
            branches: [
              { id: "b1", label: "Done", condition: { field: "status", operator: "eq", value: "done" }, nextStepIds: [] },
              { id: "b2", label: "Else", condition: null, nextStepIds: [] },
            ],
          },
        });

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("running");
    });

    it("single action step transitions to 'running' on trigger", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Single Step Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Do Work", agentId, assigneeType: "agent" });

      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({ triggeredBy: "test" });

      expect(runRes.status).toBe(201);
      expect(runRes.body.status).toBe("running");

      const runId = runRes.body.id as string;
      const detailRes = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.steps).toHaveLength(1);
      expect(detailRes.body.steps[0].status).toBe("running");
    });

    it("sequential steps: first starts running, second stays pending", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Sequential Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const step1Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Step 1", agentId, assigneeType: "agent", position: 0 });

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Step 2", agentId, assigneeType: "agent", position: 1, dependsOn: [step1Res.body.id] });

      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});
      expect(runRes.status).toBe(201);
      const runId = runRes.body.id as string;

      const detail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      const step1Status = detail.body.steps.find((s: any) => s.stepName === "Step 1").status;
      const step2Status = detail.body.steps.find((s: any) => s.stepName === "Step 2").status;
      expect(step1Status).toBe("running");
      expect(step2Status).toBe("pending");
    });

    it("marks pipeline as completed when a single-step run finishes via issue status change", async () => {
      const { companyId, agentId, projectId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Auto-Complete Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "The Only Step", agentId, assigneeType: "agent" });

      // Run with projectId so an issue is auto-created for the step
      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({ projectId });
      const runId = runRes.body.id as string;

      // Fetch the created issue from the run step
      const [runStep] = await db
        .select()
        .from(pipelineRunSteps)
        .where(eq(pipelineRunSteps.pipelineRunId, runId));
      expect(runStep.issueId).toBeTruthy();

      // Simulate agent completing the issue
      const { pipelineService } = await import("../services/pipelines.js");
      const svc = pipelineService(db);
      await svc.onIssueStatusChange(runStep.issueId!, companyId);

      // Run should now be completed
      const detail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      expect(detail.body.status).toBe("completed");
      expect(detail.body.steps[0].status).toBe("completed");
    });

    it("sequential pipeline: completing step1 issue starts step2", async () => {
      const { companyId, agentId, projectId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Chain Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const step1Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Phase 1", agentId, assigneeType: "agent", position: 0 });

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Phase 2", agentId, assigneeType: "agent", position: 1, dependsOn: [step1Res.body.id] });

      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({ projectId });
      const runId = runRes.body.id as string;

      // Step 1 issue was created, step 2 is pending
      const [step1RunStep] = await db
        .select()
        .from(pipelineRunSteps)
        .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
        .where(and(
          eq(pipelineRunSteps.pipelineRunId, runId),
          eq(pipelineSteps.name, "Phase 1"),
        ));
      expect(step1RunStep.pipeline_run_steps.issueId).toBeTruthy();

      const { pipelineService } = await import("../services/pipelines.js");
      const svc = pipelineService(db);
      await svc.onIssueStatusChange(step1RunStep.pipeline_run_steps.issueId!, companyId);

      // Phase 2 should now be running
      const detail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      const phase2 = detail.body.steps.find((s: any) => s.stepName === "Phase 2");
      const phase1 = detail.body.steps.find((s: any) => s.stepName === "Phase 1");
      expect(phase1.status).toBe("completed");
      expect(phase2.status).toBe("running");
    });
  });

  // ─── COMPLETE RUN STEP (human) ────────────────────────────────────────────────

  describe("POST /companies/:companyId/pipeline-runs/:runId/steps/:runStepId/complete", () => {
    it("human assignee completes their step, advancing to the next step", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Human Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      const step1Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Human Review", assigneeType: "user", assigneeUserId: userId, position: 0 });

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Agent Work", agentId, assigneeType: "agent", position: 1, dependsOn: [step1Res.body.id] });

      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});
      const runId = runRes.body.id as string;

      const runDetail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      const humanRunStep = runDetail.body.steps.find((s: any) => s.stepName === "Human Review");
      expect(humanRunStep.status).toBe("running");

      const completeRes = await request(app)
        .post(`/api/companies/${companyId}/pipeline-runs/${runId}/steps/${humanRunStep.id}/complete`)
        .send({});
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.completed).toBe(true);

      const afterDetail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      const agentStep = afterDetail.body.steps.find((s: any) => s.stepName === "Agent Work");
      expect(agentStep.status).toBe("running");

      const humanAfter = afterDetail.body.steps.find((s: any) => s.stepName === "Human Review");
      expect(humanAfter.status).toBe("completed");
    });

    it("single human step completes the entire run", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "One Step Human" });
      const pipelineId = pipelineRes.body.id as string;

      const stepRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Approve", assigneeType: "user", assigneeUserId: userId });
      expect(stepRes.status).toBe(201);
      expect(stepRes.body.assigneeUserId).toBe(userId);

      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});
      expect(runRes.status).toBe(201);
      const runId = runRes.body.id as string;

      const runDetail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      expect(runDetail.body.steps[0].status).toBe("running");
      const runStepId = runDetail.body.steps[0].id as string;

      const completeRes = await request(app)
        .post(`/api/companies/${companyId}/pipeline-runs/${runId}/steps/${runStepId}/complete`)
        .send({});
      expect(completeRes.status).toBe(200);

      const finalDetail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      expect(finalDetail.body.status).toBe("completed");
    });

    it("returns 404 when the wrong user tries to complete another user's step", async () => {
      const { companyId, userId } = await seedFixture();
      const wrongUserId = randomUUID();
      // App as the wrong user
      const app = createApp(boardActor(wrongUserId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Wrong User Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Owner Step", assigneeType: "user", assigneeUserId: userId });

      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});
      const runId = runRes.body.id as string;

      const runDetail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      const runStepId = runDetail.body.steps[0].id as string;

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipeline-runs/${runId}/steps/${runStepId}/complete`)
        .send({});
      expect(res.status).toBe(404);
    });

    it("returns 401 when actor has no userId", async () => {
      const { companyId } = await seedFixture();
      const app = createApp({ type: "board", source: "local_implicit", isInstanceAdmin: false, companyIds: [companyId] });

      const res = await request(app)
        .post(`/api/companies/${companyId}/pipeline-runs/${randomUUID()}/steps/${randomUUID()}/complete`)
        .send({});
      expect(res.status).toBe(401);
    });
  });

  // ─── IF/ELSE BRANCHING ────────────────────────────────────────────────────────

  describe("if/else branching", () => {
    it("matching condition routes to winning branch, skips losing branch", async () => {
      const { companyId, agentId, projectId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "IfElse E2E" });
      const pipelineId = pipelineRes.body.id as string;

      // Build: step1 (root) → if_else (dep: step1) → [branchA (dep: if_else), branchB (dep: if_else)]
      // Branch steps MUST depend on the if_else step so they stay "pending" until after
      // cascadeSkip runs, preventing them from being picked up as ready (no deps) immediately.
      const step1Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Root Action", agentId, assigneeType: "agent", position: 0 });
      const step1Id = step1Res.body.id as string;

      // Create if_else first (so we get its ID for the branch dependsOn)
      const ifElseRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({
          name: "Branch Gate",
          stepType: "if_else",
          dependsOn: [step1Id],
          position: 1,
          config: { branches: [] }, // populated after we have branch IDs
        });
      const ifElseId = ifElseRes.body.id as string;

      // Create branch steps that depend on the if_else step
      const branchARes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "In-Progress Branch", agentId, assigneeType: "agent", position: 2, dependsOn: [ifElseId] });
      const branchBRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Else Branch", agentId, assigneeType: "agent", position: 3, dependsOn: [ifElseId] });

      // Now update if_else config with the actual branch step IDs
      await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/${ifElseId}`)
        .send({
          config: {
            branches: [
              {
                id: "b1",
                label: "In Progress",
                // issue created by step1 will have status "in_progress"
                condition: { field: "status", operator: "eq", value: "in_progress" },
                nextStepIds: [branchARes.body.id],
              },
              {
                id: "b2",
                label: "Else",
                condition: null,
                nextStepIds: [branchBRes.body.id],
              },
            ],
          },
        });

      // Trigger with projectId so step1 auto-creates an issue with status "in_progress"
      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({ projectId });
      expect(runRes.status).toBe(201);
      const runId = runRes.body.id as string;

      // Get step1's runStep to find its issueId
      const [step1RunStep] = await db
        .select()
        .from(pipelineRunSteps)
        .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
        .where(and(
          eq(pipelineRunSteps.pipelineRunId, runId),
          eq(pipelineSteps.name, "Root Action"),
        ));
      expect(step1RunStep.pipeline_run_steps.issueId).toBeTruthy();

      // Complete step1's issue → triggers if_else evaluation
      const { pipelineService } = await import("../services/pipelines.js");
      const svc = pipelineService(db);
      await svc.onIssueStatusChange(step1RunStep.pipeline_run_steps.issueId!, companyId);

      // Now verify branching result
      const detail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      const ifElseStep = detail.body.steps.find((s: any) => s.stepName === "Branch Gate");
      const branchA = detail.body.steps.find((s: any) => s.stepName === "In-Progress Branch");
      const branchB = detail.body.steps.find((s: any) => s.stepName === "Else Branch");

      // if_else resolves immediately (auto-completed by evaluateReadySteps)
      expect(ifElseStep.status).toBe("completed");
      // Condition matched "in_progress" → branchA wins
      expect(branchA.status).toBe("running");
      // branchB loses → cascade skip
      expect(branchB.status).toBe("skipped");
    });

    it("falls through to else branch when no condition matches", async () => {
      const { companyId, agentId, projectId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Else Branch E2E" });
      const pipelineId = pipelineRes.body.id as string;

      const step1Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Root", agentId, assigneeType: "agent", position: 0 });
      const step1Id = step1Res.body.id as string;

      const ifElseRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({
          name: "Gate",
          stepType: "if_else",
          dependsOn: [step1Id],
          position: 1,
          config: { branches: [] },
        });
      const ifElseId = ifElseRes.body.id as string;

      // Branch steps depend on if_else so they remain "pending" until if_else resolves
      const branchARes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Done Branch", agentId, assigneeType: "agent", position: 2, dependsOn: [ifElseId] });
      const branchBRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Default Branch", agentId, assigneeType: "agent", position: 3, dependsOn: [ifElseId] });

      await request(app)
        .patch(`/api/companies/${companyId}/pipelines/${pipelineId}/steps/${ifElseId}`)
        .send({
          config: {
            branches: [
              {
                id: "b1",
                label: "Done",
                // issue will be "in_progress", NOT "done" → condition won't match
                condition: { field: "status", operator: "eq", value: "done" },
                nextStepIds: [branchARes.body.id],
              },
              {
                id: "b2",
                label: "Default",
                condition: null,
                nextStepIds: [branchBRes.body.id],
              },
            ],
          },
        });

      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({ projectId });
      expect(runRes.status).toBe(201);
      const runId = runRes.body.id as string;

      const [rootRunStep] = await db
        .select()
        .from(pipelineRunSteps)
        .innerJoin(pipelineSteps, eq(pipelineRunSteps.pipelineStepId, pipelineSteps.id))
        .where(and(
          eq(pipelineRunSteps.pipelineRunId, runId),
          eq(pipelineSteps.name, "Root"),
        ));
      expect(rootRunStep.pipeline_run_steps.issueId).toBeTruthy();

      const { pipelineService } = await import("../services/pipelines.js");
      const svc = pipelineService(db);
      await svc.onIssueStatusChange(rootRunStep.pipeline_run_steps.issueId!, companyId);

      const detail = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      const doneB = detail.body.steps.find((s: any) => s.stepName === "Done Branch");
      const defaultB = detail.body.steps.find((s: any) => s.stepName === "Default Branch");

      // "done" condition didn't match → done branch skipped
      expect(doneB.status).toBe("skipped");
      // else branch (null condition) wins → running
      expect(defaultB.status).toBe("running");
    });
  });

  // ─── RUN MANAGEMENT ───────────────────────────────────────────────────────────

  describe("GET /companies/:companyId/pipeline-runs", () => {
    it("lists all runs for a company", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Runs List Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Step", agentId, assigneeType: "agent" });

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});
      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({});

      const res = await request(app).get(`/api/companies/${companyId}/pipeline-runs`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it("filters runs by pipelineId query parameter", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const p1Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Pipeline 1" });
      const p2Res = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Pipeline 2" });

      for (const pid of [p1Res.body.id as string, p2Res.body.id as string]) {
        await request(app)
          .post(`/api/companies/${companyId}/pipelines/${pid}/steps`)
          .send({ name: "Step", agentId, assigneeType: "agent" });
        await request(app)
          .post(`/api/companies/${companyId}/pipelines/${pid}/run`)
          .send({});
      }

      const res = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs?pipelineId=${p1Res.body.id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].pipelineId).toBe(p1Res.body.id);
    });
  });

  describe("GET /companies/:companyId/pipeline-runs/:runId", () => {
    it("returns run detail with step statuses and metadata", async () => {
      const { companyId, agentId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const pipelineRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines`)
        .send({ name: "Detail Run Pipeline" });
      const pipelineId = pipelineRes.body.id as string;

      await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/steps`)
        .send({ name: "Detail Step", agentId, assigneeType: "agent" });

      const runRes = await request(app)
        .post(`/api/companies/${companyId}/pipelines/${pipelineId}/run`)
        .send({ triggeredBy: "e2e-test" });
      const runId = runRes.body.id as string;

      const res = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${runId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(runId);
      expect(res.body.triggeredBy).toBe("e2e-test");
      expect(res.body.status).toBe("running");
      expect(res.body.steps).toHaveLength(1);
      expect(res.body.steps[0].stepName).toBe("Detail Step");
      expect(res.body.steps[0].agentId).toBe(agentId);
    });

    it("returns 404 for non-existent run", async () => {
      const { companyId, userId } = await seedFixture();
      const app = createApp(boardActor(userId, companyId));

      const res = await request(app).get(
        `/api/companies/${companyId}/pipeline-runs/${randomUUID()}`,
      );
      expect(res.status).toBe(404);
    });
  });
});
