import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  acceptInviteSchema,
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerOwnerSchema,
  totpCodeSchema,
  type AcceptInviteInput,
  type LoginInput,
  type RegisterOwnerInput,
} from "@stockflow/schemas";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { Ctx, CurrentUser, Public, SkipSubscription } from "../../common/decorators";
import { requestMeta, type RequestContext, type RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { AuthService } from "./auth.service";
import { REFRESH_COOKIE, clearAuthCookies, csrfValid, isMobileClient, setAuthCookies } from "./cookies";
import type { IssuedTokens } from "./token.service";

const STRICT = { default: { limit: () => env().AUTH_RATE_LIMIT, ttl: 60_000 } };

@Controller("auth")
@SkipSubscription()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Web clients get httpOnly cookies; mobile clients get tokens in the body. */
  private respond<T extends object>(req: FastifyRequest, reply: FastifyReply, tokens: IssuedTokens, body: T) {
    if (isMobileClient(req)) {
      return { ...body, tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn } };
    }
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken, tokens.refreshExpires);
    return body;
  }

  @Get("setup-status")
  @Public()
  setupStatus() {
    return this.auth.setupStatus();
  }

  @Post("register")
  @Public()
  @Throttle(STRICT)
  async register(
    @Body(new ZodPipe(registerOwnerSchema)) body: RegisterOwnerInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { tokens, user } = await this.auth.registerOwner(body, requestMeta(req));
    return this.respond(req, reply, tokens, { user });
  }

  @Post("login")
  @Public()
  @HttpCode(200)
  @Throttle(STRICT)
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.auth.login(body, requestMeta(req));
    if ("requiresTwoFactor" in result) return result;
    return this.respond(req, reply, result.tokens, { user: result.user });
  }

  @Post("refresh")
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const fromCookie = req.cookies?.[REFRESH_COOKIE];
    const token = isMobileClient(req) ? body.refreshToken : fromCookie;
    if (!token) throw new UnauthorizedException({ message: "Session expired", code: "REFRESH_INVALID" });
    if (!isMobileClient(req) && !csrfValid(req)) throw new ForbiddenException({ message: "Invalid CSRF token", code: "CSRF" });
    try {
      const { tokens, user } = await this.auth.refresh(token, requestMeta(req));
      return this.respond(req, reply, tokens, { user });
    } catch (err) {
      if (!isMobileClient(req)) clearAuthCookies(reply);
      throw err;
    }
  }

  @Post("logout")
  @Public()
  @HttpCode(204)
  async logout(
    @Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const token = isMobileClient(req) ? body.refreshToken : req.cookies?.[REFRESH_COOKIE];
    // Logging out must work even with an expired access token, so it is keyed on the refresh token.
    if (token && (isMobileClient(req) || csrfValid(req))) await this.auth.logoutByRefreshToken(token);
    if (!isMobileClient(req)) clearAuthCookies(reply);
  }

  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return this.auth.buildAuthUser(user.id);
  }

  @Get("sessions")
  sessions(@CurrentUser() user: RequestUser) {
    return this.auth.listSessions(user);
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  revokeSession(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.auth.revokeSession(ctx.user, id, ctx);
  }

  @Post("logout-others")
  @HttpCode(204)
  logoutOthers(@Ctx() ctx: RequestContext) {
    return this.auth.logoutOthers(ctx.user, ctx);
  }

  @Post("change-password")
  @HttpCode(200)
  @Throttle(STRICT)
  async changePassword(
    @Ctx() ctx: RequestContext,
    @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { tokens, user } = await this.auth.changePassword(ctx.user, body.currentPassword, body.newPassword, ctx);
    return this.respond(req, reply, tokens, { user });
  }

  @Post("2fa/setup")
  @HttpCode(200)
  setupTwoFactor(@CurrentUser() user: RequestUser) {
    return this.auth.startTwoFactor(user);
  }

  @Post("2fa/enable")
  @HttpCode(204)
  @Throttle(STRICT)
  enableTwoFactor(@Ctx() ctx: RequestContext, @Body(new ZodPipe(totpCodeSchema)) body: { code: string }) {
    return this.auth.enableTwoFactor(ctx.user, body.code, ctx);
  }

  @Post("2fa/disable")
  @HttpCode(204)
  @Throttle(STRICT)
  disableTwoFactor(@Ctx() ctx: RequestContext, @Body(new ZodPipe(totpCodeSchema)) body: { code: string }) {
    return this.auth.disableTwoFactor(ctx.user, body.code, ctx);
  }

  @Get("invitations/:token")
  @Public()
  @Throttle(STRICT)
  describeInvitation(@Param("token") token: string) {
    return this.auth.describeInvitation(token);
  }

  @Post("accept-invite")
  @Public()
  @Throttle(STRICT)
  async acceptInvite(
    @Body(new ZodPipe(acceptInviteSchema)) body: AcceptInviteInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { tokens, user } = await this.auth.acceptInvitation(body, requestMeta(req));
    return this.respond(req, reply, tokens, { user });
  }
}
