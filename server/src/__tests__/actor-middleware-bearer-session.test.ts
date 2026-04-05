import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock better-auth to capture config
vi.mock("better-auth", () => ({
  betterAuth: vi.fn((config: unknown) => ({ _config: config, api: {} })),
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn(() => ({ type: "drizzle-mock" })),
}));

vi.mock("better-auth/node", () => ({
  toNodeHandler: vi.fn(() => () => {}),
}));

vi.mock("better-auth/plugins", () => ({
  bearer: vi.fn(() => ({ id: "bearer-plugin-mock" })),
}));

// Helper to create a Drizzle-like mock db chain.
// For each call to db.select(...).from(...).where(...), the `then` on the promise
// calls the provided onResult. This simulates .then((rows) => rows[0] ?? null).
function createDbStub(opts: {
  instanceUserRolesRows?: Array<{ id: string }>;
  companyMembershipsRows?: Array<{ companyId: string }>;
}) {
  const instanceUserRolesResult = opts.instanceUserRolesRows ?? [];
  const companyMembershipsResult = opts.companyMembershipsRows ?? [];

  let selectCallIndex = 0;
  const results = [instanceUserRolesResult, companyMembershipsResult];

  const whereFn = vi.fn(() => {
    const index = selectCallIndex - 1;
    const rows = results[index] ?? [];
    const promise = Promise.resolve(rows) as Promise<unknown[]> & { then: typeof Promise.prototype.then };
    return promise;
  });

  const fromFn = vi.fn(() => ({ where: whereFn }));

  const selectFn = vi.fn(() => {
    selectCallIndex++;
    return { from: fromFn };
  });

  return {
    db: {
      select: selectFn,
    },
    selectFn,
    fromFn,
    whereFn,
  };
}

function createMockRequest(opts: {
  authHeader?: string;
  runIdHeader?: string;
}) {
  const headers: Record<string, string | undefined> = {};
  if (opts.authHeader !== undefined) headers["authorization"] = opts.authHeader;
  if (opts.runIdHeader !== undefined) headers["x-paperclip-run-id"] = opts.runIdHeader;

  return {
    header: (name: string) => headers[name.toLowerCase()],
    actor: { type: "none", source: "none" } as unknown,
    method: "GET",
    originalUrl: "/api/test",
  };
}

describe("actorMiddleware bearer session resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: sets req.actor to board with source=bearer_session when bearer resolves to a valid user session (authenticated mode)", async () => {
    const { actorMiddleware } = await import("../middleware/auth.js");

    const { db } = createDbStub({
      instanceUserRolesRows: [],
      companyMembershipsRows: [{ companyId: "company-1" }],
    });

    const resolveSession = vi.fn().mockResolvedValue({
      session: { id: "session-123", userId: "user-abc" },
      user: { id: "user-abc", email: "test@example.com", name: "Test User" },
    });

    const middleware = actorMiddleware(db as any, {
      deploymentMode: "authenticated",
      resolveSession,
    });

    const req = createMockRequest({ authHeader: "Bearer signed-session-token" });
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      middleware(req as any, {} as any, () => {
        next();
        resolve();
      });
    });

    expect(next).toHaveBeenCalledOnce();
    const actor = req.actor as any;
    expect(actor.type).toBe("board");
    expect(actor.userId).toBe("user-abc");
    expect(actor.source).toBe("bearer_session");
    expect(actor.companyIds).toEqual(["company-1"]);
    expect(resolveSession).toHaveBeenCalledOnce();
  });

  it("Test 2: falls through to agent API key lookup when resolveSession returns null for bearer token", async () => {
    const { actorMiddleware } = await import("../middleware/auth.js");

    const { db } = createDbStub({});

    const resolveSession = vi.fn().mockResolvedValue(null);

    // We need to mock the board auth service and agent API key lookup
    const middleware = actorMiddleware(db as any, {
      deploymentMode: "authenticated",
      resolveSession,
    });

    const req = createMockRequest({ authHeader: "Bearer some-agent-token" });
    const next = vi.fn();

    // Since no API key matches in the mock db, next() is called without setting actor
    await new Promise<void>((resolve) => {
      middleware(req as any, {} as any, () => {
        next();
        resolve();
      });
    });

    expect(resolveSession).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    // Actor remains none (no agent key matched in mock either)
    const actor = req.actor as any;
    expect(actor.source).not.toBe("bearer_session");
  });

  it("Test 3: falls through to agent API key lookup when resolveSession throws an error (graceful degradation)", async () => {
    const { actorMiddleware } = await import("../middleware/auth.js");

    const { db } = createDbStub({});

    const resolveSession = vi.fn().mockRejectedValue(new Error("session resolution failed"));

    const middleware = actorMiddleware(db as any, {
      deploymentMode: "authenticated",
      resolveSession,
    });

    const req = createMockRequest({ authHeader: "Bearer some-broken-token" });
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      middleware(req as any, {} as any, () => {
        next();
        resolve();
      });
    });

    // Should not throw — graceful degradation
    expect(resolveSession).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    const actor = req.actor as any;
    expect(actor.source).not.toBe("bearer_session");
  });

  it("Test 4: does NOT attempt resolveSession for bearer tokens in local_trusted mode", async () => {
    const { actorMiddleware } = await import("../middleware/auth.js");

    const { db } = createDbStub({});

    const resolveSession = vi.fn();

    const middleware = actorMiddleware(db as any, {
      deploymentMode: "local_trusted",
      resolveSession,
    });

    const req = createMockRequest({ authHeader: "Bearer some-token" });
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      middleware(req as any, {} as any, () => {
        next();
        resolve();
      });
    });

    // In local_trusted mode, resolveSession should never be called
    expect(resolveSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    // Actor is the local_trusted default (set before bearer check)
    const actor = req.actor as any;
    expect(actor.type).toBe("board");
    expect(actor.source).toBe("local_implicit");
  });

  it("Test 5: BetterAuth instance includes bearer() plugin in plugins array", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-bearer-test";
    process.env.PAPERCLIP_PUBLIC_URL = "https://backend.example.com";

    const { createBetterAuthInstance } = await import("../auth/better-auth.js");
    const { betterAuth } = await import("better-auth");
    const betterAuthMock = vi.mocked(betterAuth);

    const mockDb = {} as any;
    const mockConfig = {
      authBaseUrlMode: "auto" as const,
      authPublicBaseUrl: "https://backend.example.com",
      deploymentMode: "authenticated" as const,
      allowedHostnames: [],
      authDisableSignUp: false,
    } as any;

    createBetterAuthInstance(mockDb, mockConfig);

    expect(betterAuthMock).toHaveBeenCalledOnce();
    const config = betterAuthMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const plugins = config.plugins as Array<unknown> | undefined;

    expect(plugins).toBeDefined();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins!.length).toBeGreaterThan(0);

    // Verify at least one plugin has the bearer plugin id
    const hasBearerPlugin = plugins!.some(
      (p: unknown) => (p as Record<string, unknown>)?.id === "bearer-plugin-mock",
    );
    expect(hasBearerPlugin).toBe(true);

    // Cleanup env vars
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.PAPERCLIP_PUBLIC_URL;
  });
});
