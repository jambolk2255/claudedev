import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import { randomToken, sha256 } from "../../common/crypto";
import { PrismaService } from "../../prisma/prisma.service";

export interface AccessPayload {
  sub: string;
  org: string;
  fid: string;
  iat?: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpires: Date;
}

const JWT_OPTIONS = { issuer: "stockflow", audience: "stockflow-api", algorithm: "HS256" as const };

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private signAccess(payload: AccessPayload): string {
    return this.jwt.sign(payload, { ...JWT_OPTIONS, secret: env().JWT_ACCESS_SECRET, expiresIn: env().ACCESS_TOKEN_TTL_SECONDS });
  }

  verifyAccess(token: string): AccessPayload {
    try {
      return this.jwt.verify<AccessPayload>(token, {
        secret: env().JWT_ACCESS_SECRET,
        issuer: JWT_OPTIONS.issuer,
        audience: JWT_OPTIONS.audience,
        algorithms: [JWT_OPTIONS.algorithm],
      });
    } catch {
      throw new UnauthorizedException({ message: "Invalid or expired token", code: "TOKEN_INVALID" });
    }
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  }

  /** Starts a new session family (fresh login). */
  async issue(user: { id: string; organizationId: string }, meta: { ip?: string; userAgent?: string }): Promise<IssuedTokens> {
    return this.createSession(user, randomUUID(), meta);
  }

  private async createSession(
    user: { id: string; organizationId: string },
    familyId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<IssuedTokens> {
    const refreshToken = randomToken();
    const refreshExpires = this.refreshExpiry();
    await this.prisma.session.create({
      data: { userId: user.id, familyId, tokenHash: sha256(refreshToken), expiresAt: refreshExpires, ip: meta.ip, userAgent: meta.userAgent },
    });
    return {
      accessToken: this.signAccess({ sub: user.id, org: user.organizationId, fid: familyId }),
      refreshToken,
      expiresIn: env().ACCESS_TOKEN_TTL_SECONDS,
      refreshExpires,
    };
  }

  /**
   * Rotates a refresh token. Re-use of an already rotated token means it was stolen:
   * the whole family is revoked and the caller must log in again.
   */
  async rotate(refreshToken: string, meta: { ip?: string; userAgent?: string }) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { id: true, organizationId: true, active: true } } },
    });
    const invalid = new UnauthorizedException({ message: "Session expired", code: "REFRESH_INVALID" });
    if (!session) throw invalid;

    if (session.rotatedAt || session.revokedAt) {
      await this.revokeFamily(session.familyId);
      throw invalid;
    }
    if (session.expiresAt < new Date() || !session.user.active) throw invalid;

    const claimed = await this.prisma.session.updateMany({
      where: { id: session.id, rotatedAt: null },
      data: { rotatedAt: new Date() },
    });
    // Lost a race with a concurrent refresh using the same token.
    if (claimed.count === 0) throw invalid;

    const tokens = await this.createSession(session.user, session.familyId, meta);
    return { tokens, userId: session.userId };
  }

  async revokeFamily(familyId: string) {
    await this.prisma.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string, exceptFamilyId?: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptFamilyId ? { NOT: { familyId: exceptFamilyId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  async familyActive(familyId: string): Promise<boolean> {
    const live = await this.prisma.session.findFirst({
      where: { familyId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return live !== null;
  }
}
