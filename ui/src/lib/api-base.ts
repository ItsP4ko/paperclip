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
