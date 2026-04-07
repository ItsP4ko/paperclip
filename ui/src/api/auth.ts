import { API_BASE, getBearerHeaders, handle401 } from "@/lib/api-base";

export type AuthSession = {
  session: { id: string; userId: string };
  user: { id: string; email: string | null; name: string | null };
};

export type SessionEntry = {
  id: string;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
};

function toSession(value: unknown): AuthSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sessionValue = record.session;
  const userValue = record.user;
  if (!sessionValue || typeof sessionValue !== "object") return null;
  if (!userValue || typeof userValue !== "object") return null;
  const session = sessionValue as Record<string, unknown>;
  const user = userValue as Record<string, unknown>;
  if (typeof session.id !== "string" || typeof session.userId !== "string") return null;
  if (typeof user.id !== "string") return null;
  return {
    session: { id: session.id, userId: session.userId },
    user: {
      id: user.id,
      email: typeof user.email === "string" ? user.email : null,
      name: typeof user.name === "string" ? user.name : null,
    },
  };
}

async function authPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/auth${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (payload as { error?: { message?: string } | string } | null)?.error &&
      typeof (payload as { error?: { message?: string } | string }).error === "object"
        ? ((payload as { error?: { message?: string } }).error?.message ?? `Request failed: ${res.status}`)
        : (payload as { error?: string } | null)?.error ?? `Request failed: ${res.status}`;
    throw new Error(message);
  }
  // Capture bearer token if present (mobile/cross-origin flows).
  // The BetterAuth bearer plugin emits set-auth-token on successful sign-in/sign-up.
  const authToken = res.headers.get("set-auth-token");
  if (authToken) {
    try {
      localStorage.setItem("paperclip_session_token", authToken);
    } catch {
      // localStorage unavailable — bearer auth won't work but cookie fallback remains
    }
  }
  return payload;
}

export const authApi = {
  getSession: async (): Promise<AuthSession | null> => {
    const bearerHeaders = getBearerHeaders();
    const res = await fetch(`${API_BASE}/auth/get-session`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...bearerHeaders,
      },
    });
    if (res.status === 401) {
      // Clear stale token and redirect to /login per user decision
      handle401();
      return null;
    }
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Failed to load session (${res.status})`);
    }
    const direct = toSession(payload);
    if (direct) return direct;
    const nested = payload && typeof payload === "object" ? toSession((payload as Record<string, unknown>).data) : null;
    return nested;
  },

  signInEmail: async (input: { email: string; password: string }) => {
    await authPost("/sign-in/email", input);
  },

  signUpEmail: async (input: { name: string; email: string; password: string }) => {
    await authPost("/sign-up/email", input);
  },

  signOut: async () => {
    await authPost("/sign-out", {});
    // Clear bearer token from localStorage (cookie is cleared server-side)
    try { localStorage.removeItem("paperclip_session_token"); } catch {}
  },

  listSessions: async (): Promise<SessionEntry[]> => {
    const res = await fetch(`${API_BASE}/auth/list-sessions`, {
      credentials: "include",
      headers: { Accept: "application/json", ...getBearerHeaders() },
    });
    if (res.status === 401) { handle401(); return []; }
    if (!res.ok) throw new Error(`Failed to list sessions (${res.status})`);
    return res.json();
  },

  revokeSession: async (token: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/auth/revoke-session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getBearerHeaders() },
      body: JSON.stringify({ token }),
    });
    if (res.status === 401) { handle401(); return; }
    if (!res.ok) throw new Error(`Failed to revoke session (${res.status})`);
  },

  revokeOtherSessions: async (): Promise<void> => {
    const res = await fetch(`${API_BASE}/auth/revoke-other-sessions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getBearerHeaders() },
      body: JSON.stringify({}),
    });
    if (res.status === 401) { handle401(); return; }
    if (!res.ok) throw new Error(`Failed to revoke other sessions (${res.status})`);
  },

  getCurrentSessionToken: (): string | null => {
    try {
      return localStorage.getItem("paperclip_session_token");
    } catch {
      return null;
    }
  },
};
