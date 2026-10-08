import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { SYSTEM_ROLES, type AcceptInviteInput, type AuthUser, type LoginInput, type RegisterOwnerInput } from "@stockflow/schemas";
import * as argon2 from "argon2";
import { env } from "../../config/env";
import { sha256 } from "../../common/crypto";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { BillingService } from "../billing/billing.service";
import { TokenService } from "./token.service";
import { TwoFactorService } from "./two-factor.service";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
/** OWASP-recommended argon2id parameters. */
const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

type Meta = { ip?: string; userAgent?: string };

@Injectable()
export class AuthService {
  /** Used to spend the same time verifying when the email doesn't exist (prevents user enumeration). */
  private dummyHash = argon2.hash("timing-equaliser-password", ARGON_OPTIONS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  hashPassword(password: string) {
    return argon2.hash(password, ARGON_OPTIONS);
  }

  async setupStatus() {
    const count = await this.prisma.organization.count();
    return {
      needsSetup: count === 0,
      signupOpen: count === 0 || env().ALLOW_MULTI_ORG_SIGNUP || env().SAAS_MODE,
      saas: env().SAAS_MODE,
      trialDays: env().TRIAL_DAYS,
    };
  }

  /** Creates the company, its system roles and the owner account. */
  async registerOwner(input: RegisterOwnerInput, meta: Meta) {
    const { signupOpen } = await this.setupStatus();
    if (!signupOpen) throw new ForbiddenException({ message: "Registration is closed. Ask an administrator for an invitation.", code: "SIGNUP_CLOSED" });

    const existing = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) throw new ConflictException({ message: "An account with this email already exists", code: "EMAIL_TAKEN" });

    const passwordHash = await this.hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: input.companyName } });
      await tx.role.createMany({
        data: SYSTEM_ROLES.map((r) => ({
          organizationId: org.id,
          key: r.key,
          name: r.name,
          description: r.description,
          permissions: r.permissions,
          isSystem: true,
        })),
      });
      const owner = await tx.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: "owner" } } });
      const created = await tx.user.create({
        data: { organizationId: org.id, email: input.email, name: input.name, passwordHash, roleId: owner.id },
      });
      await this.billing.startTrial(tx, org.id);
      await this.audit.record(
        {
          organizationId: org.id,
          userId: created.id,
          action: "organization.created",
          entity: "Organization",
          entityId: org.id,
          after: { name: org.name },
          ...meta,
        },
        tx,
      );
      return created;
    });

    const tokens = await this.tokens.issue(user, meta);
    return { tokens, user: await this.buildAuthUser(user.id) };
  }

  async login(input: LoginInput, meta: Meta) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const invalid = new UnauthorizedException({ message: "Invalid email or password", code: "INVALID_CREDENTIALS" });

    if (!user) {
      await argon2.verify(await this.dummyHash, input.password);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({ message: "Account temporarily locked. Try again later.", code: "LOCKED", lockedUntil: user.lockedUntil });
    }

    const passwordOk = await argon2.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      await this.registerFailure(user.id, user.organizationId, user.failedLoginCount, meta);
      throw invalid;
    }
    if (!user.active) throw new UnauthorizedException({ message: "This account is disabled", code: "DISABLED" });

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!input.totp) return { requiresTwoFactor: true as const };
      if (!this.twoFactor.verify(user.twoFactorSecret, input.totp)) {
        await this.registerFailure(user.id, user.organizationId, user.failedLoginCount, meta);
        throw new UnauthorizedException({ message: "Invalid authentication code", code: "INVALID_TOTP" });
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit.record({ organizationId: user.organizationId, userId: user.id, action: "auth.login", entity: "User", entityId: user.id, ...meta });

    const tokens = await this.tokens.issue(user, meta);
    return { tokens, user: await this.buildAuthUser(user.id) };
  }

  private async registerFailure(userId: string, organizationId: string, previous: number, meta: Meta) {
    const failed = previous + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined },
    });
    await this.audit.record({ organizationId, userId, action: lock ? "auth.locked" : "auth.login_failed", entity: "User", entityId: userId, ...meta });
  }

  async refresh(refreshToken: string, meta: Meta) {
    const { tokens, userId } = await this.tokens.rotate(refreshToken, meta);
    return { tokens, user: await this.buildAuthUser(userId) };
  }

  async logout(user: RequestUser, meta: Meta) {
    await this.tokens.revokeFamily(user.familyId);
    await this.audit.record({ organizationId: user.organizationId, userId: user.id, action: "auth.logout", entity: "User", entityId: user.id, ...meta });
  }

  async logoutByRefreshToken(refreshToken: string) {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(refreshToken) }, select: { familyId: true } });
    if (session) await this.tokens.revokeFamily(session.familyId);
  }

  async buildAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true, organization: true },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      locale: user.locale === "si" ? "si" : "en",
      twoFactorEnabled: user.twoFactorEnabled,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        onboardingCompleted: user.organization.onboardingCompletedAt !== null,
        mode: user.organization.mode,
        modules: user.organization.modules,
        currency: user.organization.currency,
      },
      role: { id: user.role.id, key: user.role.key, name: user.role.name },
      permissions: user.role.permissions,
      platformAdmin: this.billing.isPlatformAdmin(user.email),
      subscription: await this.subscriptionSummary(user.organizationId, user.email),
    };
  }

  private async subscriptionSummary(organizationId: string, email: string): Promise<AuthUser["subscription"]> {
    const current = await this.billing.stateFor(organizationId, email);
    if (!current) return null;
    const { state, sub } = current;
    return { status: state.status, planName: sub.plan.name, readOnly: state.readOnly, blocked: state.blocked, daysLeft: state.daysLeft };
  }

  async listSessions(user: RequestUser) {
    // One row per family: the newest token describes the device.
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, familyId: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
    });
    return sessions.map((s) => ({ ...s, current: s.familyId === user.familyId }));
  }

  async revokeSession(user: RequestUser, sessionId: string, meta: Meta) {
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId: user.id } });
    if (!session) throw new NotFoundException();
    await this.tokens.revokeFamily(session.familyId);
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: "auth.session_revoked",
      entity: "Session",
      entityId: sessionId,
      ...meta,
    });
  }

  async logoutOthers(user: RequestUser, meta: Meta) {
    await this.tokens.revokeAllForUser(user.id, user.familyId);
    await this.audit.record({ organizationId: user.organizationId, userId: user.id, action: "auth.logout_others", entity: "User", entityId: user.id, ...meta });
  }

  async changePassword(user: RequestUser, currentPassword: string, newPassword: string, meta: Meta) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await argon2.verify(record.passwordHash, currentPassword))) {
      throw new BadRequestException({ message: "Current password is incorrect", code: "INVALID_PASSWORD" });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.hashPassword(newPassword), passwordChangedAt: new Date() },
    });
    await this.tokens.revokeAllForUser(user.id);
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: "auth.password_changed",
      entity: "User",
      entityId: user.id,
      ...meta,
    });
    const tokens = await this.tokens.issue(record, meta);
    return { tokens, user: await this.buildAuthUser(user.id) };
  }

  async startTwoFactor(user: RequestUser) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { organization: true } });
    if (record.twoFactorEnabled) throw new ConflictException({ message: "Two-factor authentication is already enabled", code: "2FA_ENABLED" });
    const { encryptedSecret, secret, otpauthUrl, qrDataUrl } = await this.twoFactor.createSecret(record.email, `StockFlow (${record.organization.name})`);
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: encryptedSecret } });
    return { secret, otpauthUrl, qrDataUrl };
  }

  async enableTwoFactor(user: RequestUser, code: string, meta: Meta) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!record.twoFactorSecret || !this.twoFactor.verify(record.twoFactorSecret, code)) {
      throw new BadRequestException({ message: "Invalid authentication code", code: "INVALID_TOTP" });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await this.audit.record({ organizationId: user.organizationId, userId: user.id, action: "auth.2fa_enabled", entity: "User", entityId: user.id, ...meta });
  }

  async disableTwoFactor(user: RequestUser, code: string, meta: Meta) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!record.twoFactorEnabled || !record.twoFactorSecret || !this.twoFactor.verify(record.twoFactorSecret, code)) {
      throw new BadRequestException({ message: "Invalid authentication code", code: "INVALID_TOTP" });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    await this.audit.record({ organizationId: user.organizationId, userId: user.id, action: "auth.2fa_disabled", entity: "User", entityId: user.id, ...meta });
  }

  private async findOpenInvitation(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { organization: { select: { name: true } }, role: { select: { name: true } } },
    });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date()) {
      throw new NotFoundException({ message: "This invitation is invalid or has expired", code: "INVITE_INVALID" });
    }
    return invitation;
  }

  async describeInvitation(token: string) {
    const inv = await this.findOpenInvitation(token);
    return { email: inv.email, organization: inv.organization.name, role: inv.role.name, expiresAt: inv.expiresAt };
  }

  async acceptInvitation(input: AcceptInviteInput, meta: Meta) {
    const inv = await this.findOpenInvitation(input.token);
    const existing = await this.prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } });
    if (existing) throw new ConflictException({ message: "An account with this email already exists", code: "EMAIL_TAKEN" });

    const passwordHash = await this.hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count === 0) throw new NotFoundException({ message: "This invitation is invalid or has expired", code: "INVITE_INVALID" });
      const created = await tx.user.create({
        data: { organizationId: inv.organizationId, email: inv.email, name: input.name, passwordHash, roleId: inv.roleId },
      });
      await this.audit.record(
        {
          organizationId: inv.organizationId,
          userId: created.id,
          action: "user.joined",
          entity: "User",
          entityId: created.id,
          after: { email: created.email },
          ...meta,
        },
        tx,
      );
      return created;
    });
    const tokens = await this.tokens.issue(user, meta);
    return { tokens, user: await this.buildAuthUser(user.id) };
  }
}
