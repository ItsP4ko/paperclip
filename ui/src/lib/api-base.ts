// Centralized API base URL derived from VITE_API_URL env var.
// When VITE_API_URL is set (e.g. "https://backend.railway.app"), all API
// calls target that origin. When unset, falls back to relative paths
// (local dev mode where Vite proxy handles /api routing).

const API_ORIGIN = import.meta.env.VITE_API_URL || "";

/** Base URL for REST API calls. Prepend to "/endpoint" paths. */
export const API_BASE = API_ORIGIN ? `${API_ORIGIN}/api` : "/api";

/**
 * Returns the host (hostname:port) for WebSocket connections.
 * When VITE_API_URL is set, extracts host from the URL.
 * When unset, returns window.location.host (same-origin dev mode).
 */
export function getWsHost(): string {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    return new URL(apiUrl).host;
  }
  return window.location.host;
}

/**
 * Returns an Authorization: Bearer header object when a session token
 * exists in localStorage, or an empty object otherwise.
 * Used by all authenticated fetch calls for cross-origin mobile support.
 */
export function getBearerHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem("paperclip_session_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // localStorage may be unavailable in some contexts (SSR, privacy mode)
    return {};
  }
}

/**
 * Centralized 401 handler: clears the bearer token from localStorage
 * and redirects to /login. Per user decision (CONTEXT.md): "On any 401
 * response: clear the localStorage token and redirect to /login.
 * No silent refresh."
 */
export function handle401(): void {
  try {
    localStorage.removeItem("paperclip_session_token");
  } catch {
    // localStorage unavailable
  }
  // Only redirect if not already on /auth to avoid redirect loops
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/auth?next=${next}`;
  }
}
