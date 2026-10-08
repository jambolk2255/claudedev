import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { PARTNER_TYPES, paginationSchema, partnerInputSchema, type PartnerInput, type PartnerType } from "@stockflow/schemas";
import { z } from "zod";
import { Ctx, CurrentUser } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { nextNumber } from "./sequence";

const listQuery = paginationSchema.extend({ type: z.enum(PARTNER_TYPES), active: z.enum(["true", "false", "all"]).default("true") });

/** Customers follow sales permissions, suppliers follow purchasing permissions. */
const PERMS = {
  customer: { view: "sales.view", manage: "sales.manage" },
  supplier: { view: "purchasing.view", manage: "purchasing.manage" },
} as const;

function assertCan(user: RequestUser, type: PartnerType, action: "view" | "manage") {
  if (!user.permissions.includes(PERMS[type][action])) throw new ForbiddenException({ message: "You do not have permission to do this", code: "FORBIDDEN" });
}

@Controller("partners")
export class PartnersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    assertCan(user, q.type, "view");
    const db = this.prisma.tenant(user.organizationId);
    const where = {
      type: q.type,
      ...(q.active === "all" ? {} : { active: q.active === "true" }),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: "insensitive" as const } },
              { code: { contains: q.search, mode: "insensitive" as const } },
              { phone: { contains: q.search } },
              { email: { contains: q.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.partner.findMany({ where, orderBy: { name: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.partner.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  @Get(":id")
  async get(@CurrentUser() user: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    const partner = await this.prisma.tenant(user.organizationId).partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException();
    assertCan(user, partner.type, "view");
    return partner;
  }

  @Post()
  async create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(partnerInputSchema)) body: PartnerInput) {
    assertCan(ctx.user, body.type, "manage");
    const orgId = ctx.user.organizationId;
    return this.prisma.$transaction(async (tx) => {
      const code = body.code ?? (await nextNumber(tx, orgId, body.type));
      const partner = await tx.partner.create({ data: { ...body, code, organizationId: orgId } });
      await this.audit.record(
        {
          organizationId: orgId,
          userId: ctx.user.id,
          action: `${body.type}.created`,
          entity: "Partner",
          entityId: partner.id,
          after: { code, name: partner.name },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return partner;
    });
  }

  @Put(":id")
  async update(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(partnerInputSchema)) body: PartnerInput) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    const before = await db.partner.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    assertCan(ctx.user, before.type, "manage");
    const { type: _type, code, ...data } = body;
    const updated = await db.partner.update({ where: { id }, data: { ...data, ...(code ? { code } : {}) } });
    await this.audit.record({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.id,
      action: `${before.type}.updated`,
      entity: "Partner",
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }
}
