import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ACCESS_COOKIE, SAFE_METHODS, csrfValid } from "../modules/auth/cookies";
import { TokenService } from "../modules/auth/token.service";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC, PERMISSIONS } from "./decorators";
import type { AuthedRequest } from "./request-user";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const cookie = req.cookies?.[ACCESS_COOKIE];
    const token = bearer ?? cookie;
    if (!token) throw new UnauthorizedException({ message: "Authentication required", code: "UNAUTHENTICATED" });

    // Cookies are sent automatically by browsers, so cookie-authenticated mutations need a CSRF token.
    if (!bearer && !SAFE_METHODS.has(req.method) && !csrfValid(req)) {
      throw new ForbiddenException({ message: "Invalid CSRF token", code: "CSRF" });
    }

    const payload = this.tokens.verifyAccess(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { select: { id: true, key: true, permissions: true } } },
    });
    const unauthorized = new UnauthorizedException({ message: "Session is no longer valid", code: "TOKEN_INVALID" });
    if (!user || !user.active || user.organizationId !== payload.org) throw unauthorized;
    // Tokens issued before a password change are rejected.
    if (payload.iat && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) throw unauthorized;
    if (!(await this.tokens.familyActive(payload.fid))) throw unauthorized;

    req.user = {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      roleId: user.role.id,
      roleKey: user.role.key,
      permissions: user.role.permissions,
      familyId: payload.fid,
    };
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    const granted = new Set(user?.permissions ?? []);
    if (required.every((p) => granted.has(p))) return true;
    throw new ForbiddenException({ message: "You do not have permission to do this", code: "FORBIDDEN" });
  }
}
