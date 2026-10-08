import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { PERMISSION_GROUPS, roleInputSchema } from "@stockflow/schemas";
import type { z } from "zod";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

type RoleInput = z.infer<typeof roleInputSchema>;

@Controller("roles")
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions("roles.view")
  list(@CurrentUser() user: RequestUser) {
    return this.prisma.tenant(user.organizationId).role.findMany({
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
      include: { _count: { select: { users: true } } },
    });
  }

  @Get("permissions")
  @RequirePermissions("roles.view")
  permissions() {
    return PERMISSION_GROUPS;
  }

  @Post()
  @RequirePermissions("roles.manage")
  async create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(roleInputSchema)) body: RoleInput) {
    const role = await this.prisma.tenant(ctx.user.organizationId).role.create({
      data: { organizationId: ctx.user.organizationId, name: body.name, description: body.description, permissions: body.permissions },
    });
    await this.audit.record({ organizationId: ctx.user.organizationId, userId: ctx.user.id, action: "role.created", entity: "Role", entityId: role.id, after: body, ip: ctx.ip, userAgent: ctx.userAgent });
    return role;
  }

  @Patch(":id")
  @RequirePermissions("roles.manage")
  async update(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(roleInputSchema)) body: RoleInput) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    const role = await db.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException();
    if (role.key === "owner") throw new ForbiddenException({ message: "The owner role cannot be changed", code: "OWNER_ROLE" });
    // System roles keep their name so translations and defaults stay stable.
    const updated = await db.role.update({
      where: { id },
      data: { permissions: body.permissions, ...(role.isSystem ? {} : { name: body.name, description: body.description }) },
    });
    await this.audit.record({ organizationId: ctx.user.organizationId, userId: ctx.user.id, action: "role.updated", entity: "Role", entityId: id, before: { name: role.name, permissions: role.permissions }, after: body, ip: ctx.ip, userAgent: ctx.userAgent });
    return updated;
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("roles.manage")
  async remove(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException();
    if (role.isSystem) throw new ForbiddenException({ message: "System roles cannot be deleted", code: "SYSTEM_ROLE" });
    if (role._count.users > 0) throw new BadRequestException({ message: "Move users to another role first", code: "ROLE_IN_USE" });
    await db.role.delete({ where: { id } });
    await this.audit.record({ organizationId: ctx.user.organizationId, userId: ctx.user.id, action: "role.deleted", entity: "Role", entityId: id, before: { name: role.name }, ip: ctx.ip, userAgent: ctx.userAgent });
  }
}
