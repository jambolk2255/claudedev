import Constants from "expo-constants";
import { storage } from "./storage";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const SERVER_KEY = "sf.server";
const REFRESH_KEY = "sf.refresh";
const DEFAULT_SERVER = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "https://stock.example.lk";

let server = DEFAULT_SERVER;
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

export const normalizeServer = (url: string) => {
  const trimmed = url.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export async function loadServer() {
  server = (await storage.get(SERVER_KEY)) ?? DEFAULT_SERVER;
  return server;
}
export async function setServer(url: string) {
  server = normalizeServer(url);
  await storage.set(SERVER_KEY, server);
}
export const getServer = () => server;

export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler;
}

export async function saveSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  await storage.set(REFRESH_KEY, tokens.refreshToken);
}

export async function clearSession() {
  const refreshToken = await storage.get(REFRESH_KEY);
  accessToken = null;
  await storage.remove(REFRESH_KEY);
  if (refreshToken) await raw("/auth/logout", "POST", { refreshToken }).catch(() => undefined);
}

function raw(path: string, method: string, body?: unknown) {
  const headers: Record<string, string> = { accept: "application/json", "x-client": "mobile" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (method !== "GET") headers["content-type"] = "application/json";
  return fetch(`${server}/api/v1${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
}

/** Exchanges the stored refresh token for a new pair (single flight). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = await storage.get(REFRESH_KEY);
    if (!refreshToken) return false;
    const res = await raw("/auth/refresh", "POST", { refreshToken }).catch(() => null);
    if (!res?.ok) return false;
    const data = (await res.json()) as { tokens: { accessToken: string; refreshToken: string } };
    await saveSession(data.tokens);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
  retried = false,
): Promise<T> {
  const method = options.method ?? "GET";
  let res: Response;
  try {
    res = await raw(path, method, options.body);
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.", "NETWORK");
  }
  if (res.status === 401 && !retried && !path.startsWith("/auth/login")) {
    if (await refreshSession()) return api<T>(path, options, true);
    onSignedOut?.();
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = Array.isArray(data.message) ? String(data.message[0]) : String(data.message ?? res.statusText);
    throw new ApiError(res.status, message, data.code as string | undefined);
  }
  return data as T;
}
