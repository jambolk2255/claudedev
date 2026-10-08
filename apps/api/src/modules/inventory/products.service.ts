import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Paginated, ProductInput } from "@stockflow/schemas";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { nextNumber } from "./sequence";
import { StockQueryService } from "./stock-query.service";

export interface ProductListQuery {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  warehouseId?: string;
  stock?: "all" | "low" | "out" | "in";
  active?: "true" | "false" | "all";
}

const listInclude = (warehouseId?: string) =>
  ({
    category: { select: { id: true, name: true } },
    unit: { select: { id: true, code: true } },
    levels: { where: warehouseId ? { warehouseId } : {}, select: { quantity: true, avgCost: true, warehouseId: true } },
  }) satisfies Prisma.ProductInclude;

function withStock<T extends { levels: { quantity: Prisma.Decimal; avgCost: Prisma.Decimal }[] }>(p: T) {
  const onHand = p.levels.reduce((s, l) => s.add(l.quantity), new Prisma.Decimal(0));
  const value = p.levels.reduce((s, l) => (l.quantity.gt(0) ? s.add(l.quantity.mul(l.avgCost)) : s), new Prisma.Decimal(0));
  const { levels: _levels, ...rest } = p;
  return { ...rest, onHand: onHand.toNumber(), stockValue: value.toDecimalPlaces(2).toNumber() };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockQueryService,
  ) {}

  async list(orgId: string, q: ProductListQuery): Promise<Paginated<ReturnType<typeof withStock>>> {
    const db = this.prisma.tenant(orgId);
    const where: Prisma.ProductWhereInput = {
      ...(q.active === "all" ? {} : { active: q.active !== "false" }),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: "insensitive" } },
              { sku: { contains: q.search, mode: "insensitive" } },
              { barcode: { equals: q.search } },
            ],
          }
        : {}),
    };
    if (q.stock === "low" || q.stock === "out") {
      const alerts = await this.stock.stockAlerts(orgId);
      const ids = alerts
        .filter((a) => (q.stock === "out" ? a.type === "out_of_stock" : a.type === "low_stock" || a.type === "out_of_stock"))
        .map((a) => a.productId);
      where.id = { in: ids };
    }
    if (q.stock === "in") where.levels = { some: { quantity: { gt: 0 }, ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}) } };

    const [items, total] = await Promise.all([
      db.product.findMany({ where, include: listInclude(q.warehouseId), orderBy: { name: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.product.count({ where }),
    ]);
    return { items: items.map(withStock), total, page: q.page, pageSize: q.pageSize };
  }

  /** Exact SKU or barcode match, used by barcode scanners and quick entry. */
  async lookup(orgId: string, code: string) {
    const db = this.prisma.tenant(orgId);
    const product = await db.product.findFirst({ where: { active: true, OR: [{ sku: code.toUpperCase() }, { barcode: code }] }, include: listInclude() });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "No product with this code" });
    return withStock(product);
  }

  async get(orgId: string, id: string) {
    const db = this.prisma.tenant(orgId);
    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, code: true, name: true } },
        taxRate: { select: { id: true, code: true, rate: true } },
        levels: { include: { warehouse: { select: { id: true, name: true, code: true } } }, orderBy: { warehouse: { name: "asc" } } },
        batches: {
          include: { balances: { where: { quantity: { not: 0 } }, include: { warehouse: { select: { id: true, code: true } } } } },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!product) throw new NotFoundException();
    const movements = await db.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        warehouse: { select: { code: true } },
        batch: { select: { batchNo: true } },
        document: { select: { id: true, number: true, type: true } },
        createdBy: { select: { name: true } },
      },
    });
    const { levels, ...rest } = product;
    return {
      ...withStock({ ...rest, levels }),
      levels: levels.map((l) => ({
        warehouse: l.warehouse,
        quantity: l.quantity,
        avgCost: l.avgCost,
        value: l.quantity.gt(0) ? l.quantity.mul(l.avgCost).toDecimalPlaces(2) : 0,
      })),
      batches: product.batches.filter((b) => b.balances.length > 0),
      movements,
    };
  }

  private async assertRefs(orgId: string, input: ProductInput) {
    const db = this.prisma.tenant(orgId);
    const checks: Promise<unknown>[] = [];
    if (input.categoryId) checks.push(db.category.findUniqueOrThrow({ where: { id: input.categoryId } }));
    if (input.unitId) checks.push(db.unit.findUniqueOrThrow({ where: { id: input.unitId } }));
    if (input.taxRateId) checks.push(db.taxRate.findUniqueOrThrow({ where: { id: input.taxRateId } }));
    try {
      await Promise.all(checks);
    } catch {
      throw new BadRequestException({ code: "REFERENCE_INVALID", message: "Category, unit or tax rate not found" });
    }
  }

  async create(ctx: RequestContext, input: ProductInput) {
    const orgId = ctx.user.organizationId;
    await this.assertRefs(orgId, input);
    const product = await this.prisma.$transaction(async (tx) => {
      const sku = input.sku ?? (await nextNumber(tx, orgId, "product"));
      const { sku: _sku, ...data } = input;
      const created = await tx.product.create({ data: { ...data, sku, organizationId: orgId } });
      await this.audit.record(
        {
          organizationId: orgId,
          userId: ctx.user.id,
          action: "product.created",
          entity: "Product",
          entityId: created.id,
          after: { sku, name: created.name },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return created;
    });
    return product;
  }

  async update(ctx: RequestContext, id: string, input: ProductInput) {
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const before = await db.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    await this.assertRefs(orgId, input);

    if (input.type === "service" && before.type === "stock") {
      const stocked = await db.stockMovement.count({ where: { productId: id } });
      if (stocked) throw new ConflictException({ code: "HAS_STOCK_HISTORY", message: "Products with stock history can't become services" });
    }
    if (before.trackBatches && !input.trackBatches) {
      const open = await db.batchBalance.count({ where: { batch: { productId: id }, quantity: { not: 0 } } });
      if (open) throw new ConflictException({ code: "HAS_BATCH_STOCK", message: "Clear batch stock before turning off batch tracking" });
    }
    if (!before.trackBatches && input.trackBatches) {
      const onHand = await db.stockLevel.count({ where: { productId: id, quantity: { not: 0 } } });
      if (onHand) throw new ConflictException({ code: "HAS_UNBATCHED_STOCK", message: "Batch tracking can only be turned on while the product has no stock" });
    }

    const { sku, ...data } = input;
    const updated = await db.product.update({ where: { id }, data: { ...data, ...(sku ? { sku } : {}) } });
    await this.audit.record({
      organizationId: orgId,
      userId: ctx.user.id,
      action: "product.updated",
      entity: "Product",
      entityId: id,
      before: { sku: before.sku, name: before.name, costPrice: before.costPrice, sellPrice: before.sellPrice, active: before.active },
      after: { sku: updated.sku, name: updated.name, costPrice: updated.costPrice, sellPrice: updated.sellPrice, active: updated.active },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  async remove(ctx: RequestContext, id: string) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    const product = await db.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException();
    const used = (await db.stockMovement.count({ where: { productId: id } })) + (await this.prisma.stockDocumentLine.count({ where: { productId: id } }));
    if (used) throw new ConflictException({ code: "IN_USE", message: "This product has stock history. Deactivate it instead." });
    await db.product.delete({ where: { id } });
    await this.audit.record({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.id,
      action: "product.deleted",
      entity: "Product",
      entityId: id,
      before: { sku: product.sku },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }
}
