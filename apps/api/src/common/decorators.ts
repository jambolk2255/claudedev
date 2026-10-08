import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Permission } from "@stockflow/schemas";
import { requestMeta, type AuthedRequest, type RequestContext, type RequestUser } from "./request-user";

export const IS_PUBLIC = "isPublic";
export const PERMISSIONS = "permissions";

/** Skips JWT authentication for the route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Requires the user to hold every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error("CurrentUser used on a public route");
  return req.user;
});

/** User plus client IP / user agent, for audit logging. */
export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error("Ctx used on a public route");
  return { user: req.user, ...requestMeta(req) };
});

export const SKIP_SUBSCRIPTION = "skipSubscription";

/** Route stays available when the subscription is read-only or suspended (auth, billing). */
export const SkipSubscription = () => SetMetadata(SKIP_SUBSCRIPTION, true);
