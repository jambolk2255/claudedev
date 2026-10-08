import { Body, Controller, Get, Patch } from "@nestjs/common";
import { companyStepSchema, modulesStepSchema, normalizeModules } from "@stockflow/schemas";
import type { z } from "zod";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const updateOrganizationSchema = companyStepSchema.partial().merge(modulesStepSchema.partial());
type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;

@Controller("organization")
export class OrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions("organization.view")
  async get(@CurrentUser() user: RequestUser) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    const { onboardingState: _state, ...rest } = org;
    return rest;
  }

  @Get("overview")
  async overview(@CurrentUser() user: RequestUser) {
    const db = this.prisma.tenant(user.organizationId);
    const [warehouses, users, taxRates, roles] = await Promise.all([
      db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
      db.user.count({ where: { active: true } }),
      db.taxRate.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
      db.role.count(),
    ]);
    return { warehouses, users, taxRates, roles };
  }

  @Patch()
  @RequirePermissions("organization.manage")
  async update(@Ctx() ctx: RequestContext, @Body(new ZodPipe(updateOrganizationSchema)) body: UpdateOrganization) {
    const before = await this.prisma.organization.findUniqueOrThrow({ where: { id: ctx.user.organizationId } });
    const mode = body.mode ?? before.mode;
    const data = {
      ...body,
      ...(body.modules || body.mode ? { modules: normalizeModules(mode, (body.modules ?? before.modules) as never) } : {}),
    };
    const org = await this.prisma.organization.update({ where: { id: ctx.user.organizationId }, data });
    await this.audit.record({
      organizationId: org.id,
      userId: ctx.user.id,
      action: "organization.updated",
      entity: "Organization",
      entityId: org.id,
      after: body,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    const { onboardingState: _state, ...rest } = org;
    return rest;
  }
}
