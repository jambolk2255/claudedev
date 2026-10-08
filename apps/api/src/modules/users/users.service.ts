import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Paginated } from "@stockflow/schemas";
import { env } from "../../config/env";
import { randomToken, sha256 } from "../../common/crypto";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { TokenService } from "../auth/token.service";

const INVITE_TTL_DAYS = 7;

const userSelect = {
  id: true,
  name: true,
  email: true,
  active: true,
  locale: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, key: true, name: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  async list(orgId: string, q: { page: number; pageSize: number; search?: string }): Promise<Paginated<unknown>> {
    const db = this.prisma.tenant(orgId);
    const where = q.search
      ? { OR: [{ name: { contains: q.search, mode: "insensitive" as const } }, { email: { contains: q.search, mode: "insensitive" as const } }] }
      : {};
    const [items, total] = await Promise.all([
      db.user.findMany({ where, select: userSelect, orderBy: { createdAt: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.user.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async update(ctx: RequestContext, userId: string, input: { roleId?: string; active?: boolean }) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    if (userId === ctx.user.id) throw new BadRequestException({ message: "You cannot change your own role or status", code: "SELF_EDIT" });

    const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!target) throw new NotFoundException();
    const actorIsOwner = ctx.user.roleKey === "owner";
    if (target.role.key === "owner" && !actorIsOwner) throw new ForbiddenException({ message: "Only an owner can change another owner", code: "FORBIDDEN" });

    if (input.roleId) {
      const role = await db.role.findUnique({ where: { id: input.roleId } });
      if (!role) throw new NotFoundException({ message: "Role not found" });
      if (role.key === "owner" && !actorIsOwner) throw new ForbiddenException({ message: "Only an owner can grant the owner role", code: "FORBIDDEN" });
    }

    const updated = await db.user.update({ where: { id: userId }, data: input, select: userSelect });
    if (input.active === false) await this.tokens.revokeAllForUser(userId);
    await this.audit.record({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.id,
      action: "user.updated",
      entity: "User",
      entityId: userId,
      before: { roleId: target.roleId, active: target.active },
      after: input,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  async updateProfile(ctx: RequestContext, input: { name?: string; locale?: "en" | "si" }) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    return db.user.update({ where: { id: ctx.user.id }, data: input, select: userSelect });
  }

  listInvitations(orgId: string) {
    return this.prisma.tenant(orgId).invitation.findMany({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, expiresAt: true, createdAt: true, role: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Creates an invitation. Until email delivery is configured the link is returned to the inviter. */
  async invite(ctx: RequestContext, email: string, roleId: string) {
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const role = await db.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException({ message: "Role not found" });
    if (role.key === "owner" && ctx.user.roleKey !== "owner") throw new ForbiddenException({ message: "Only an owner can invite owners", code: "FORBIDDEN" });

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException({ message: "A user with this email already exists", code: "EMAIL_TAKEN" });

    // Replace any pending invitation for the same email.
    await db.invitation.updateMany({ where: { email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });

    const token = randomToken(32);
    const invitation = await db.invitation.create({
      data: {
        organizationId: orgId,
        email,
        roleId,
        tokenHash: sha256(token),
        invitedById: ctx.user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      },
      select: { id: true, email: true, expiresAt: true, role: { select: { id: true, name: true } } },
    });
    await this.audit.record({ organizationId: orgId, userId: ctx.user.id, action: "user.invited", entity: "Invitation", entityId: invitation.id, after: { email, role: role.name }, ip: ctx.ip, userAgent: ctx.userAgent });
    return { invitation, inviteUrl: `${env().WEB_URL}/invite/${token}` };
  }

  async revokeInvitation(ctx: RequestContext, id: string) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    const result = await db.invitation.updateMany({ where: { id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count === 0) throw new NotFoundException();
    await this.audit.record({ organizationId: ctx.user.organizationId, userId: ctx.user.id, action: "user.invite_revoked", entity: "Invitation", entityId: id, ip: ctx.ip, userAgent: ctx.userAgent });
  }
}
