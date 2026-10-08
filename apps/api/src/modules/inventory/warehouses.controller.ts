import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { warehouseUpdateSchema } from "@stockflow/schemas";
import type { z } from "zod";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

type WarehouseInput = z.infer<typeof warehouseUpdateSchema>;

@Controller("warehouses")
export class WarehousesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions("warehouses.view")
  async list(@CurrentUser() user: RequestUser) {
    const db = this.prisma.tenant(user.organizationId);
    const [warehouses, totals] = await Promise.all([
      db.warehouse.findMany({ orderBy: [{ active: "desc" }, { isDefault: "desc" }, { name: "asc" }] }),
      db.stockLevel.groupBy({ by: ["warehouseId"], where: { quantity: { gt: 0 } }, _count: { productId: true }, _sum: { quantity: true } }),
    ]);
    const byId = new Map(totals.map((t) => [t.warehouseId, t]));
    return warehouses.map((w) => ({ ...w, products: byId.get(w.id)?._count.productId ?? 0, units: Number(byId.get(w.id)?._sum.quantity ?? 0) }));
  }

  @Post()
  @RequirePermissions("warehouses.manage")
  async create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(warehouseUpdateSchema)) body: WarehouseInput) {
    const orgId = ctx.user.organizationId;
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.warehouse.count({ where: { organizationId: orgId, active: true } });
      const isDefault = body.isDefault || count === 0;
      if (isDefault) await tx.warehouse.updateMany({ where: { organizationId: orgId }, data: { isDefault: false } });
      const warehouse = await tx.warehouse.create({ data: { ...body, isDefault, organizationId: orgId } });
      await this.audit.record(
        {
          organizationId: orgId,
          userId: ctx.user.id,
          action: "warehouse.created",
          entity: "Warehouse",
          entityId: warehouse.id,
          after: { code: warehouse.code },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return warehouse;
    });
  }

  @Put(":id")
  @RequirePermissions("warehouses.manage")
  async update(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(warehouseUpdateSchema)) body: WarehouseInput) {
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const before = await db.warehouse.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    if (!body.active) {
      if (before.isDefault || body.isDefault) throw new ConflictException({ code: "DEFAULT_WAREHOUSE", message: "Make another warehouse the default first" });
      const stocked = await db.stockLevel.count({ where: { warehouseId: id, quantity: { not: 0 } } });
      if (stocked) throw new ConflictException({ code: "HAS_STOCK", message: "Move or adjust out the stock before deactivating this warehouse" });
    }
    return this.prisma.$transaction(async (tx) => {
      if (body.isDefault && !before.isDefault) await tx.warehouse.updateMany({ where: { organizationId: orgId }, data: { isDefault: false } });
      const updated = await tx.warehouse.update({ where: { id }, data: { ...body, isDefault: body.isDefault || (before.isDefault && body.active) } });
      await this.audit.record(
        {
          organizationId: orgId,
          userId: ctx.user.id,
          action: "warehouse.updated",
          entity: "Warehouse",
          entityId: id,
          before: { name: before.name, active: before.active },
          after: body,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return updated;
    });
  }
}
