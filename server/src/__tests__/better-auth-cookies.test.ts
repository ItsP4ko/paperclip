import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// We mock better-auth to capture the config object passed to betterAuth()
vi.mock("better-auth", () => ({
  betterAuth: vi.fn((config: unknown) => ({ _config: config, api: {} })),
}));

// We also mock the drizzle adapter to avoid DB connection
vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn(() => ({ type: "drizzle-mock" })),
}));

// Mock toNodeHandler
vi.mock("better-auth/node", () => ({
  toNodeHandler: vi.fn(() => () => {}),
}));

describe("createBetterAuthInstance cookie config", () => {
  let originalBetterAuthSecret: string | undefined;
  let originalAgentJwtSecret: string | undefined;
  let originalPublicUrl: string | undefined;

  beforeEach(() => {
    originalBetterAuthSecret = process.env.BETTER_AUTH_SECRET;
    originalAgentJwtSecret = process.env.PAPERCLIP_AGENT_JWT_SECRET;
    originalPublicUrl = process.env.PAPERCLIP_PUBLIC_URL;
  });

  afterEach(() => {
    if (originalBetterAuthSecret !== undefined) {
      process.env.BETTER_AUTH_SECRET = originalBetterAuthSecret;
    } else {
      delete process.env.BETTER_AUTH_SECRET;
    }
    if (originalAgentJwtSecret !== undefined) {
      process.env.PAPERCLIP_AGENT_JWT_SECRET = originalAgentJwtSecret;
    } else {
      delete process.env.PAPERCLIP_AGENT_JWT_SECRET;
    }
    if (originalPublicUrl !== undefined) {
      process.env.PAPERCLIP_PUBLIC_URL = originalPublicUrl;
    } else {
      delete process.env.PAPERCLIP_PUBLIC_URL;
    }
    vi.resetModules();
  });

  it("includes defaultCookieAttributes with sameSite=none and secure=true for HTTPS deployment", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.PAPERCLIP_PUBLIC_URL = "https://backend.railway.app";

    const { createBetterAuthInstance } = await import("../auth/better-auth.js");
    const { betterAuth } = await import("better-auth");
    const betterAuthMock = vi.mocked(betterAuth);

    const mockDb = {} as Parameters<typeof createBetterAuthInstance>[0];
    const mockConfig = {
      authBaseUrlMode: "auto" as const,
      authPublicBaseUrl: "https://backend.railway.app",
      deploymentMode: "authenticated" as const,
      allowedHostnames: [],
      authDisableSignUp: false,
    } as Parameters<typeof createBetterAuthInstance>[1];

    createBetterAuthInstance(mockDb, mockConfig);

    expect(betterAuthMock).toHaveBeenCalled();
    const config = betterAuthMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const advanced = config.advanced as Record<string, unknown> | undefined;
    const defaultCookieAttributes = advanced?.defaultCookieAttributes as Record<string, unknown> | undefined;

    expect(defaultCookieAttributes).toBeDefined();
    expect(defaultCookieAttributes?.sameSite).toBe("none");
    expect(defaultCookieAttributes?.secure).toBe(true);
  });

  it("uses useSecureCookies: false for HTTP deployment (isHttpOnly=true)", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.PAPERCLIP_PUBLIC_URL = "http://localhost:3100";

    const { createBetterAuthInstance } = await import("../auth/better-auth.js");
    const { betterAuth } = await import("better-auth");
    const betterAuthMock = vi.mocked(betterAuth);

    const mockDb = {} as Parameters<typeof createBetterAuthInstance>[0];
    const mockConfig = {
      authBaseUrlMode: "auto" as const,
      authPublicBaseUrl: undefined,
      deploymentMode: "authenticated" as const,
      allowedHostnames: [],
      authDisableSignUp: false,
    } as Parameters<typeof createBetterAuthInstance>[1];

    createBetterAuthInstance(mockDb, mockConfig);

    expect(betterAuthMock).toHaveBeenCalled();
    const config = betterAuthMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const advanced = config.advanced as Record<string, unknown> | undefined;

    expect(advanced?.useSecureCookies).toBe(false);
    // Should NOT have defaultCookieAttributes in HTTP mode
    expect(advanced?.defaultCookieAttributes).toBeUndefined();
  });

  it("throws when BETTER_AUTH_SECRET and PAPERCLIP_AGENT_JWT_SECRET are both unset", async () => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.PAPERCLIP_AGENT_JWT_SECRET;
    process.env.PAPERCLIP_PUBLIC_URL = "https://backend.railway.app";

    const { createBetterAuthInstance } = await import("../auth/better-auth.js");

    const mockDb = {} as Parameters<typeof createBetterAuthInstance>[0];
    const mockConfig = {
      authBaseUrlMode: "auto" as const,
      authPublicBaseUrl: "https://backend.railway.app",
      deploymentMode: "authenticated" as const,
      allowedHostnames: [],
      authDisableSignUp: false,
    } as Parameters<typeof createBetterAuthInstance>[1];

    expect(() => createBetterAuthInstance(mockDb, mockConfig)).toThrow(
      "BETTER_AUTH_SECRET must be set",
    );
  });
});
