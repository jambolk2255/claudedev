import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Paginated, StockAlert, StockSummary } from "@stockflow/schemas";
import { PrismaService } from "../../prisma/prisma.service";

export interface DocumentListQuery {
  page: number;
  pageSize: number;
  search?: string;
  type?: string;
  status?: string;
  warehouseId?: string;
}

export interface MovementListQuery {
  page: number;
  pageSize: number;
  productId?: string;
  warehouseId?: string;
  type?: string;
}

@Injectable()
export class StockQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listDocuments(orgId: string, q: DocumentListQuery): Promise<Paginated<unknown>> {
    const db = this.prisma.tenant(orgId);
    const where: Prisma.StockDocumentWhereInput = {
      ...(q.type ? { type: q.type as Prisma.EnumStockDocumentTypeFilter["equals"] } : {}),
      ...(q.status ? { status: q.status as Prisma.EnumStockDocumentStatusFilter["equals"] } : {}),
      ...(q.warehouseId ? { OR: [{ warehouseId: q.warehouseId }, { toWarehouseId: q.warehouseId }] } : {}),
      ...(q.search
        ? { AND: [{ OR: [{ number: { contains: q.search, mode: "insensitive" } }, { reference: { contains: q.search, mode: "insensitive" } }] }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.stockDocument.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          toWarehouse: { select: { id: true, name: true, code: true } },
          partner: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
          _count: { select: { lines: true } },
        },
      }),
      db.stockDocument.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async getDocument(orgId: string, id: string) {
    const doc = await this.prisma.tenant(orgId).stockDocument.findUnique({
      where: { id },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        toWarehouse: { select: { id: true, name: true, code: true } },
        partner: { select: { id: true, name: true, type: true } },
        createdBy: { select: { name: true } },
        lines: { orderBy: { lineNo: "asc" }, include: { product: { select: { id: true, sku: true, name: true, unit: { select: { code: true } } } } } },
        movements: {
          orderBy: { createdAt: "asc" },
          include: { warehouse: { select: { code: true } }, batch: { select: { batchNo: true, expiryDate: true } }, product: { select: { sku: true } } },
        },
      },
    });
    if (!doc) throw new NotFoundException();
    return doc;
  }

  async listMovements(orgId: string, q: MovementListQuery): Promise<Paginated<unknown>> {
    const db = this.prisma.tenant(orgId);
    const where: Prisma.StockMovementWhereInput = {
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
      ...(q.type ? { type: q.type as Prisma.EnumStockMovementTypeFilter["equals"] } : {}),
    };
    const [items, total] = await Promise.all([
      db.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          product: { select: { id: true, sku: true, name: true } },
          warehouse: { select: { code: true, name: true } },
          batch: { select: { batchNo: true } },
          document: { select: { id: true, number: true, type: true } },
          createdBy: { select: { name: true } },
        },
      }),
      db.stockMovement.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  /** Product-level stock alerts (totals across warehouses) plus batch expiry alerts. */
  async stockAlerts(orgId: string): Promise<StockAlert[]> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { expiryAlertDays: true } });
    const rows = await this.prisma.$queryRaw<
      { id: string; sku: string; name: string; reorderLevel: Prisma.Decimal | null; maxLevel: Prisma.Decimal | null; qty: Prisma.Decimal; stocked: boolean }[]
    >`
      SELECT p.id, p.sku, p.name, p."reorderLevel", p."maxLevel",
             COALESCE(SUM(l.quantity), 0) AS qty, COUNT(l.id) > 0 AS stocked
      FROM "Product" p
      LEFT JOIN "StockLevel" l ON l."productId" = p.id
      WHERE p."organizationId" = ${orgId}::uuid AND p.active AND p.type = 'stock'
      GROUP BY p.id`;
    const alerts: StockAlert[] = [];
    for (const r of rows) {
      const qty = Number(r.qty);
      const reorder = r.reorderLevel === null ? null : Number(r.reorderLevel);
      const max = r.maxLevel === null ? null : Number(r.maxLevel);
      const base = { productId: r.id, sku: r.sku, name: r.name, quantity: qty };
      if (qty <= 0 && (r.stocked || reorder !== null)) alerts.push({ ...base, type: "out_of_stock", threshold: reorder });
      else if (reorder !== null && qty <= reorder) alerts.push({ ...base, type: "low_stock", threshold: reorder });
      else if (max !== null && qty > max) alerts.push({ ...base, type: "overstock", threshold: max });
    }

    const horizon = new Date(Date.now() + org.expiryAlertDays * 86_400_000);
    const today = new Date(new Date().toISOString().slice(0, 10));
    const batches = await this.prisma.tenant(orgId).batchBalance.findMany({
      where: { quantity: { gt: 0 }, batch: { expiryDate: { lte: horizon } } },
      include: {
        batch: { include: { product: { select: { id: true, sku: true, name: true, active: true } } } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { batch: { expiryDate: "asc" } },
    });
    for (const b of batches) {
      if (!b.batch.product.active || !b.batch.expiryDate) continue;
      alerts.push({
        type: b.batch.expiryDate < today ? "expired" : "expiring",
        productId: b.batch.product.id,
        sku: b.batch.product.sku,
        name: b.batch.product.name,
        quantity: Number(b.quantity),
        threshold: org.expiryAlertDays,
        batchNo: b.batch.batchNo,
        expiryDate: b.batch.expiryDate.toISOString().slice(0, 10),
        warehouseId: b.warehouse.id,
        warehouseName: b.warehouse.name,
      });
    }
    const order = { expired: 0, out_of_stock: 1, expiring: 2, low_stock: 3, overstock: 4 } as const;
    return alerts.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
  }

  async summary(orgId: string): Promise<StockSummary> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { valuationMethod: true } });
    const db = this.prisma.tenant(orgId);
    const [products, warehouses, alerts] = await Promise.all([
      db.product.count({ where: { active: true } }),
      db.warehouse.findMany({ where: { active: true }, select: { id: true, name: true, code: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
      this.stockAlerts(orgId),
    ]);
    // FIFO value comes from remaining cost layers; weighted average from quantity × average cost.
    const values =
      org.valuationMethod === "fifo"
        ? await this.prisma.$queryRaw<{ warehouseId: string; value: Prisma.Decimal; units: Prisma.Decimal }[]>`
            SELECT c."warehouseId", SUM(c."remainingQty" * c."unitCost") AS value, SUM(c."remainingQty") AS units
            FROM "CostLayer" c WHERE c."organizationId" = ${orgId}::uuid AND c."remainingQty" > 0 GROUP BY c."warehouseId"`
        : await this.prisma.$queryRaw<{ warehouseId: string; value: Prisma.Decimal; units: Prisma.Decimal }[]>`
            SELECT l."warehouseId", SUM(l.quantity * l."avgCost") AS value, SUM(l.quantity) AS units
            FROM "StockLevel" l WHERE l."organizationId" = ${orgId}::uuid AND l.quantity > 0 GROUP BY l."warehouseId"`;
    const byWh = new Map(values.map((v) => [v.warehouseId, v]));
    const byWarehouse = warehouses.map((w) => ({
      warehouseId: w.id,
      name: w.name,
      code: w.code,
      value: Math.round(Number(byWh.get(w.id)?.value ?? 0) * 100) / 100,
      units: Number(byWh.get(w.id)?.units ?? 0),
    }));
    return {
      products,
      stockValue: Math.round(byWarehouse.reduce((s, w) => s + w.value, 0) * 100) / 100,
      units: byWarehouse.reduce((s, w) => s + w.units, 0),
      lowStock: alerts.filter((a) => a.type === "low_stock").length,
      outOfStock: alerts.filter((a) => a.type === "out_of_stock").length,
      expiring: alerts.filter((a) => a.type === "expiring" || a.type === "expired").length,
      byWarehouse,
    };
  }
}
