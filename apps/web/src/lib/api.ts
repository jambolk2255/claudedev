/**
 * Browser API client. Auth lives in httpOnly cookies set by the API; this client only
 * echoes the CSRF cookie in a header and transparently refreshes an expired access token.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public issues?: { path: string; message: string }[],
    public body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const BASE = "/api/v1";
const NO_REFRESH = ["/auth/login", "/auth/refresh", "/auth/register", "/auth/accept-invite", "/auth/logout"];

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

let refreshing: Promise<boolean> | null = null;
let onExpired: (() => void) | null = null;

/** Called once when the session can't be refreshed (e.g. to redirect to login). */
export function setSessionExpiredHandler(handler: () => void) {
  onExpired = handler;
}

async function refreshSession(): Promise<boolean> {
  // Single-flight: concurrent 401s share one refresh request.
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-csrf-token": readCookie("sf_csrf") ?? "" },
    body: "{}",
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function api<T = unknown>(path: string, options: { method?: Method; body?: unknown; signal?: AbortSignal } = {}, retried = false): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") {
    // Mutations always send a JSON body (at least "{}") so the API can parse and validate it.
    headers["content-type"] = "application/json";
    headers["x-csrf-token"] = readCookie("sf_csrf") ?? "";
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    signal: options.signal,
  });

  if (res.status === 401 && !retried && !NO_REFRESH.some((p) => path.startsWith(p))) {
    if (await refreshSession()) return api<T>(path, options, true);
    onExpired?.();
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = Array.isArray(data.message) ? String(data.message[0]) : String(data.message ?? res.statusText);
    throw new ApiError(res.status, message, data.code as string | undefined, data.issues as ApiError["issues"], data);
  }
  return data as T;
}
