import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env";
import { randomToken, safeEqual } from "../../common/crypto";

export const ACCESS_COOKIE = "sf_at";
export const REFRESH_COOKIE = "sf_rt";
export const CSRF_COOKIE = "sf_csrf";
export const CSRF_HEADER = "x-csrf-token";
/** Refresh cookie is only sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

/** Native/mobile clients send this header and receive tokens in the body instead of cookies. */
export function isMobileClient(req: FastifyRequest): boolean {
  return req.headers["x-client"] === "mobile";
}

export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string, refreshExpires: Date) {
  const secure = env().COOKIE_SECURE;
  reply.setCookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: env().ACCESS_TOKEN_TTL_SECONDS,
  });
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    expires: refreshExpires,
  });
  // Double-submit CSRF token: readable by the web app, echoed in a header on mutations.
  reply.setCookie(CSRF_COOKIE, randomToken(24), {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    expires: refreshExpires,
  });
}

export function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: "/" });
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  reply.clearCookie(CSRF_COOKIE, { path: "/" });
}

export function csrfValid(req: FastifyRequest): boolean {
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  return typeof cookie === "string" && typeof header === "string" && cookie.length > 0 && safeEqual(cookie, header);
}

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
