import type { AuthUser } from "@stockflow/schemas";

/** Only allow same-site relative paths as post-login destinations (prevents open redirects). */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

export function homeFor(user: AuthUser, next: string | null) {
  if (!user.organization.onboardingCompleted && user.permissions.includes("organization.manage")) return "/onboarding";
  return safeNext(next) ?? "/dashboard";
}
