import { API_BASE, getBearerHeaders, handle401 } from "@/ui/lib/api-base";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  const body = init?.body;
  if (!(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Inject bearer auth header for cross-origin mobile support
  const bearer = getBearerHeaders();
  for (const [key, value] of Object.entries(bearer)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    credentials: "include",
    ...init,
    signal: init?.signal ?? controller.signal,
  }).finally(() => clearTimeout(timeoutId));

  if (!res.ok) {
    if (res.status === 401) {
      handle401();
    }
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(
      (errorBody as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
      res.status,
      errorBody,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData) =>
    request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  deleteWithBody: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "DELETE", body: JSON.stringify(body) }),
};
