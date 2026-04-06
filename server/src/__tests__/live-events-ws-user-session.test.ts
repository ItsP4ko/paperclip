import { describe, expect, it, vi, beforeEach } from "vitest";
import type { IncomingMessage } from "node:http";

// Mock the ws module to avoid actual WebSocket server setup
vi.mock("ws", () => ({
  WebSocket: { OPEN: 1 },
  WebSocketServer: vi.fn(() => ({
    clients: new Set(),
    on: vi.fn(),
    handleUpgrade: vi.fn(),
    emit: vi.fn(),
  })),
}));

// Mock subscribeCompanyLiveEvents to avoid live event subscription
vi.mock("../services/live-events.js", () => ({
  subscribeCompanyLiveEvents: vi.fn(() => vi.fn()),
}));

// Mock the logger to prevent log output
vi.mock("../middleware/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper to build a Drizzle-like mock db chain for select queries.
// The chain supports: db.select(...).from(...).where(...) => Promise<rows[]>
// Plus optional db.update(...).set(...).where(...) for agentApiKeys update on success.
function createDbStub(opts: {
  agentApiKeyRow?: { id: string; keyHash: string; companyId: string; agentId: string; revokedAt: null | Date } | null;
  instanceUserRolesRows?: Array<{ id: string }>;
  companyMembershipsRows?: Array<{ companyId: string }>;
}) {
  const agentKeyResult = opts.agentApiKeyRow !== undefined ? opts.agentApiKeyRow : null;
  const instanceUserRolesResult = opts.instanceUserRolesRows ?? [];
  const companyMembershipsResult = opts.companyMembershipsRows ?? [];

  // Track how many times select is called to return the right result set
  let selectCallIndex = 0;

  const whereFn = vi.fn(() => {
    const index = selectCallIndex - 1;
    let rows: unknown[];
    if (index === 0) {
      // First call: agent API key lookup
      rows = agentKeyResult ? [agentKeyResult] : [];
    } else if (index === 1) {
      // Second call: instanceUserRoles lookup
      rows = instanceUserRolesResult;
    } else {
      // Third call: companyMemberships lookup
      rows = companyMembershipsResult;
    }
    return Promise.resolve(rows);
  });

  const fromFn = vi.fn(() => ({ where: whereFn }));

  const selectFn = vi.fn(() => {
    selectCallIndex++;
    return { from: fromFn };
  });

  // Update mock (used for agentApiKeys lastUsedAt update on agent key success)
  const updateWhereFn = vi.fn().mockResolvedValue([]);
  const setFn = vi.fn(() => ({ where: updateWhereFn }));
  const updateFn = vi.fn(() => ({ set: setFn }));

  return {
    db: {
      select: selectFn,
      update: updateFn,
    },
  };
}

function createMockRequest(opts: {
  headers?: Record<string, string | undefined>;
}): IncomingMessage {
  return {
    headers: opts.headers ?? {},
    method: "GET",
    url: "/api/companies/company-1/events/ws",
  } as unknown as IncomingMessage;
}

describe("authorizeUpgrade user session resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: returns board context when agent key lookup fails but resolveSessionFromHeaders succeeds with company membership", async () => {
    const { authorizeUpgrade } = await import("../realtime/live-events-ws.js");

    const { db } = createDbStub({
      agentApiKeyRow: null, // no agent key match
      instanceUserRolesRows: [],
      companyMembershipsRows: [{ companyId: "company-1" }],
    });

    const resolveSessionFromHeaders = vi.fn().mockResolvedValue({
      session: { id: "session-123", userId: "user-abc" },
      user: { id: "user-abc", email: "test@example.com", name: "Test User" },
    });

    const req = createMockRequest({ headers: {} });
    const url = new URL("http://localhost/api/companies/company-1/events/ws?token=signed-session-token");

    const result = await authorizeUpgrade(db as any, req, "company-1", url, {
      deploymentMode: "authenticated",
      resolveSessionFromHeaders,
    });

    expect(result).not.toBeNull();
    expect(result?.actorType).toBe("board");
    expect(result?.actorId).toBe("user-abc");
    expect(result?.companyId).toBe("company-1");
    expect(resolveSessionFromHeaders).toHaveBeenCalledOnce();
  });

  it("Test 2: returns null when agent key lookup fails and resolveSessionFromHeaders returns null", async () => {
    const { authorizeUpgrade } = await import("../realtime/live-events-ws.js");

    const { db } = createDbStub({
      agentApiKeyRow: null, // no agent key match
    });

    const resolveSessionFromHeaders = vi.fn().mockResolvedValue(null);

    const req = createMockRequest({ headers: {} });
    const url = new URL("http://localhost/api/companies/company-1/events/ws?token=unknown-token");

    const result = await authorizeUpgrade(db as any, req, "company-1", url, {
      deploymentMode: "authenticated",
      resolveSessionFromHeaders,
    });

    expect(result).toBeNull();
    expect(resolveSessionFromHeaders).toHaveBeenCalledOnce();
  });

  it("Test 3: returns null when session resolves to a user without membership in the requested company", async () => {
    const { authorizeUpgrade } = await import("../realtime/live-events-ws.js");

    const { db } = createDbStub({
      agentApiKeyRow: null, // no agent key match
      instanceUserRolesRows: [], // not instance admin
      companyMembershipsRows: [{ companyId: "other-company" }], // different company
    });

    const resolveSessionFromHeaders = vi.fn().mockResolvedValue({
      session: { id: "session-123", userId: "user-abc" },
      user: { id: "user-abc", email: "test@example.com", name: "Test User" },
    });

    const req = createMockRequest({ headers: {} });
    const url = new URL("http://localhost/api/companies/company-1/events/ws?token=signed-session-token");

    const result = await authorizeUpgrade(db as any, req, "company-1", url, {
      deploymentMode: "authenticated",
      resolveSessionFromHeaders,
    });

    expect(result).toBeNull();
  });

  it("Test 4: returns agent context when agent API key lookup succeeds (existing behavior preserved)", async () => {
    const { authorizeUpgrade } = await import("../realtime/live-events-ws.js");

    const agentApiKeyRow = {
      id: "key-1",
      keyHash: "some-hash",
      companyId: "company-1",
      agentId: "agent-xyz",
      revokedAt: null,
    };

    const { db } = createDbStub({
      agentApiKeyRow,
    });

    const resolveSessionFromHeaders = vi.fn();

    const req = createMockRequest({ headers: {} });
    // We need an actual token that maps to the agent key hash
    // Since we're mocking the db to return the row regardless of hash, any token works
    const url = new URL("http://localhost/api/companies/company-1/events/ws?token=agent-api-key-token");

    const result = await authorizeUpgrade(db as any, req, "company-1", url, {
      deploymentMode: "authenticated",
      resolveSessionFromHeaders,
    });

    expect(result).not.toBeNull();
    expect(result?.actorType).toBe("agent");
    expect(result?.actorId).toBe("agent-xyz");
    expect(result?.companyId).toBe("company-1");
    // resolveSessionFromHeaders should NOT be called when agent key lookup succeeds
    expect(resolveSessionFromHeaders).not.toHaveBeenCalled();
  });

  it("Test 5: passes synthetic headers with Authorization: Bearer <token> to resolveSessionFromHeaders", async () => {
    const { authorizeUpgrade } = await import("../realtime/live-events-ws.js");

    const { db } = createDbStub({
      agentApiKeyRow: null,
      instanceUserRolesRows: [],
      companyMembershipsRows: [{ companyId: "company-1" }],
    });

    let capturedHeaders: Headers | null = null;
    const resolveSessionFromHeaders = vi.fn().mockImplementation((headers: Headers) => {
      capturedHeaders = headers;
      return Promise.resolve({
        session: { id: "session-123", userId: "user-abc" },
        user: { id: "user-abc", email: "test@example.com", name: "Test User" },
      });
    });

    const testToken = "signed-bearer-token-value";
    const req = createMockRequest({ headers: {} });
    const url = new URL(`http://localhost/api/companies/company-1/events/ws?token=${encodeURIComponent(testToken)}`);

    await authorizeUpgrade(db as any, req, "company-1", url, {
      deploymentMode: "authenticated",
      resolveSessionFromHeaders,
    });

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!.get("authorization")).toBe(`Bearer ${testToken}`);
  });
});

describe("setupLiveEventsWebSocketServer options", () => {
  it("passes perMessageDeflate: false to WebSocketServer constructor", async () => {
    const { WebSocketServer: MockedWSS } = await import("ws");
    const { setupLiveEventsWebSocketServer } = await import("../realtime/live-events-ws.js");

    const mockServer = {
      on: vi.fn(),
    };

    setupLiveEventsWebSocketServer(mockServer as any, {} as any, {
      deploymentMode: "local_trusted",
    });

    expect(MockedWSS).toHaveBeenCalledWith({
      noServer: true,
      perMessageDeflate: false,
    });
  });
});
