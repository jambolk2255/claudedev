import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type StockMovementType, type ValuationMethod } from "@prisma/client";
import { STOCK_DOCUMENT_PERMISSIONS, STOCK_DOCUMENT_SEQUENCES, type StockDocumentInput } from "@stockflow/schemas";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AccountingService, type JournalLineSpec } from "../finance/accounting.service";
import { nextNumber, type SequenceType } from "./sequence";

type Dec = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const round4 = (v: Dec) => v.toDecimalPlaces(4);

export interface ProductInfo {
  id: string;
  sku: string;
  name: string;
  costPrice: Dec;
  trackBatches: boolean;
}

export type LedgerDocType = "stock_in" | "stock_out" | "adjustment" | "count" | "transfer" | "grn" | "delivery" | "return_outward" | "return_inward";

export interface PostSpec {
  type: LedgerDocType;
  warehouseId: string;
  toWarehouseId?: string | null;
  partnerId?: string | null;
  orderId?: string | null;
  reference?: string | null;
  reason?: string | null;
  note?: string | null;
  documentDate?: string | null;
  /** Set false when the caller books the accounting itself (e.g. returns with credit/debit notes). */
  journal?: boolean;
  lines: {
    productId: string;
    /** Signed for adjustments; counted quantity for counts; positive otherwise. */
    quantity: number;
    unitCost?: number | null;
    batchNo: string | null;
    expiryDate?: string | null;
    note?: string | null;
    orderLineId?: string | null;
  }[];
}

export interface PreparedPosting {
  organizationId: string;
  spec: PostSpec;
  products: Map<string, ProductInfo>;
  valuation: ValuationMethod;
  allowNegative: boolean;
}

export interface PostResult {
  id: string;
  number: string;
  total: Dec;
  lines: { index: number; productId: string; orderLineId: string | null; quantity: Dec; value: Dec }[];
}

const SEQUENCES: Record<LedgerDocType, SequenceType> = {
  ...STOCK_DOCUMENT_SEQUENCES,
  grn: "grn",
  delivery: "deliveryNote",
  return_outward: "returnOutward",
  return_inward: "returnInward",
};
const RECEIPT_TYPE = { stock_in: "stock_in", grn: "purchase_in", return_inward: "return_in" } as const;
const ISSUE_TYPE = { stock_out: "stock_out", delivery: "sale_out", return_outward: "return_out", transfer: "transfer_out" } as const;
const SUPPLIER_DOCS = new Set<LedgerDocType>(["stock_in", "grn", "return_outward"]);

/** Everything a posting needs, scoped to one transaction. */
interface Ledger {
  tx: Prisma.TransactionClient;
  organizationId: string;
  userId: string | null;
  documentId: string | null;
  valuation: ValuationMethod;
  allowNegative: boolean;
}

interface MovementResult {
  quantity: Dec;
  unitCost: Dec;
  totalCost: Dec;
  batchId: string | null;
}

function insufficient(product: ProductInfo, available: Dec, batchNo?: string) {
  return new BadRequestException({
    code: "INSUFFICIENT_STOCK",
    message: `Not enough stock for ${product.sku}${batchNo ? ` (batch ${batchNo})` : ""}: ${available.toNumber()} available`,
    productId: product.id,
    available: available.toNumber(),
  });
}

/**
 * Posts stock documents into the immutable ledger. Every quantity change goes through
 * `applyMovement`, which locks the affected StockLevel row, values the movement
 * (weighted average or FIFO layers) and appends a StockMovement.
 */
@Injectable()
export class StockLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounting: AccountingService,
  ) {}

  // ─── Low-level ledger operations ────────────────────────────────────────────

  private async lockLevel(l: Ledger, productId: string, warehouseId: string) {
    await l.tx.$executeRaw`
      INSERT INTO "StockLevel" (id, "organizationId", "productId", "warehouseId", quantity, "avgCost", "updatedAt")
      VALUES (gen_random_uuid(), ${l.organizationId}::uuid, ${productId}::uuid, ${warehouseId}::uuid, 0, 0, now())
      ON CONFLICT ("productId", "warehouseId") DO NOTHING`;
    const rows = await l.tx.$queryRaw<{ id: string; quantity: Dec; avgCost: Dec }[]>`
      SELECT id, quantity, "avgCost" FROM "StockLevel"
      WHERE "productId" = ${productId}::uuid AND "warehouseId" = ${warehouseId}::uuid FOR UPDATE`;
    const row = rows[0]!;
    return { id: row.id, quantity: D(row.quantity), avgCost: D(row.avgCost) };
  }

  private async lockBatchBalance(l: Ledger, batchId: string, warehouseId: string) {
    await l.tx.$executeRaw`
      INSERT INTO "BatchBalance" (id, "organizationId", "batchId", "warehouseId", quantity)
      VALUES (gen_random_uuid(), ${l.organizationId}::uuid, ${batchId}::uuid, ${warehouseId}::uuid, 0)
      ON CONFLICT ("batchId", "warehouseId") DO NOTHING`;
    const rows = await l.tx.$queryRaw<{ id: string; quantity: Dec }[]>`
      SELECT id, quantity FROM "BatchBalance" WHERE "batchId" = ${batchId}::uuid AND "warehouseId" = ${warehouseId}::uuid FOR UPDATE`;
    return { id: rows[0]!.id, quantity: D(rows[0]!.quantity) };
  }

  /** Consumes FIFO layers oldest-first and returns the cost of the consumed quantity. */
  private async consumeLayers(l: Ledger, productId: string, warehouseId: string, need: Dec, fallbackCost: Dec): Promise<Dec> {
    const layers = await l.tx.$queryRaw<{ id: string; remainingQty: Dec; unitCost: Dec }[]>`
      SELECT id, "remainingQty", "unitCost" FROM "CostLayer"
      WHERE "productId" = ${productId}::uuid AND "warehouseId" = ${warehouseId}::uuid AND "remainingQty" > 0
      ORDER BY "receivedAt", id FOR UPDATE`;
    let remaining = need;
    let cost = ZERO;
    for (const layer of layers) {
      if (remaining.lte(0)) break;
      const available = D(layer.remainingQty);
      const take = Prisma.Decimal.min(available, remaining);
      cost = cost.add(take.mul(D(layer.unitCost)));
      remaining = remaining.sub(take);
      await l.tx.costLayer.update({ where: { id: layer.id }, data: { remainingQty: available.sub(take) } });
    }
    // Only reachable when negative stock is allowed: value the shortfall at average cost.
    if (remaining.gt(0)) cost = cost.add(remaining.mul(fallbackCost));
    return cost;
  }

  /**
   * Applies a signed quantity change for one product in one warehouse (optionally one batch).
   * Receipts take `unitCost`; issues are valued by the organization's valuation method.
   */
  private async applyMovement(
    l: Ledger,
    args: { product: ProductInfo; warehouseId: string; quantity: Dec; type: StockMovementType; unitCost?: Dec; batchId?: string | null; batchNo?: string },
  ): Promise<MovementResult> {
    const { product, warehouseId, quantity, type } = args;
    const batchId = args.batchId ?? null;
    const level = await this.lockLevel(l, product.id, warehouseId);
    const currentCost = level.avgCost.gt(0) ? level.avgCost : product.costPrice;
    let unitCost: Dec;
    let totalCost: Dec;
    let newQty: Dec;
    let newAvg = level.avgCost;

    if (quantity.gt(0)) {
      unitCost = args.unitCost ?? currentCost;
      newQty = level.quantity.add(quantity);
      newAvg = level.quantity.lte(0) || newQty.lte(0) ? unitCost : level.quantity.mul(level.avgCost).add(quantity.mul(unitCost)).div(newQty);
      totalCost = quantity.mul(unitCost);
      if (l.valuation === "fifo") {
        await l.tx.costLayer.create({
          data: {
            organizationId: l.organizationId,
            productId: product.id,
            warehouseId,
            unitCost: round4(unitCost),
            originalQty: quantity,
            remainingQty: quantity,
          },
        });
      }
      if (batchId) {
        const bal = await this.lockBatchBalance(l, batchId, warehouseId);
        await l.tx.batchBalance.update({ where: { id: bal.id }, data: { quantity: bal.quantity.add(quantity) } });
      }
    } else {
      const need = quantity.neg();
      if (!l.allowNegative && level.quantity.lt(need)) throw insufficient(product, level.quantity);
      if (batchId) {
        const bal = await this.lockBatchBalance(l, batchId, warehouseId);
        if (!l.allowNegative && bal.quantity.lt(need)) throw insufficient(product, bal.quantity, args.batchNo);
        await l.tx.batchBalance.update({ where: { id: bal.id }, data: { quantity: bal.quantity.sub(need) } });
      }
      const cost = l.valuation === "fifo" ? await this.consumeLayers(l, product.id, warehouseId, need, currentCost) : need.mul(currentCost);
      unitCost = cost.div(need);
      totalCost = cost.neg();
      newQty = level.quantity.sub(need);
    }

    await l.tx.stockLevel.update({ where: { id: level.id }, data: { quantity: newQty, avgCost: round4(newAvg) } });
    await l.tx.stockMovement.create({
      data: {
        organizationId: l.organizationId,
        productId: product.id,
        warehouseId,
        batchId,
        documentId: l.documentId,
        type,
        quantity,
        unitCost: round4(unitCost),
        totalCost: round4(totalCost),
        balanceAfter: newQty,
        createdById: l.userId,
      },
    });
    return { quantity, unitCost: round4(unitCost), totalCost: round4(totalCost), batchId };
  }

  private async findOrCreateBatch(l: Ledger, product: ProductInfo, batchNo: string, expiryDate?: string | null) {
    const existing = await l.tx.batch.findUnique({ where: { productId_batchNo: { productId: product.id, batchNo } } });
    if (existing) {
      if (!existing.expiryDate && expiryDate) await l.tx.batch.update({ where: { id: existing.id }, data: { expiryDate: new Date(expiryDate) } });
      return existing;
    }
    return l.tx.batch.create({
      data: { organizationId: l.organizationId, productId: product.id, batchNo, expiryDate: expiryDate ? new Date(expiryDate) : null },
    });
  }

  /** Receipt of one line, creating the batch when the product is batch-tracked. */
  private async receive(
    l: Ledger,
    product: ProductInfo,
    warehouseId: string,
    line: { quantity: Dec; unitCost?: Dec; batchNo: string | null; expiryDate?: string | null },
    type: StockMovementType,
  ) {
    let batchId: string | null = null;
    if (product.trackBatches) {
      if (!line.batchNo)
        throw new BadRequestException({ code: "BATCH_REQUIRED", message: `${product.sku} is batch-tracked: enter a batch number`, productId: product.id });
      batchId = (await this.findOrCreateBatch(l, product, line.batchNo, line.expiryDate)).id;
    }
    return [await this.applyMovement(l, { product, warehouseId, quantity: line.quantity, unitCost: line.unitCost, batchId, type })];
  }

  /** Issue of one line. Batch-tracked products without a batch number are picked FEFO (first expiry, first out). */
  private async issue(
    l: Ledger,
    product: ProductInfo,
    warehouseId: string,
    quantity: Dec,
    batchNo: string | null,
    type: StockMovementType,
  ): Promise<MovementResult[]> {
    const neg = (q: Dec) => q.neg();
    if (!product.trackBatches) return [await this.applyMovement(l, { product, warehouseId, quantity: neg(quantity), type })];

    if (batchNo) {
      const batch = await l.tx.batch.findUnique({ where: { productId_batchNo: { productId: product.id, batchNo } } });
      if (!batch) throw new BadRequestException({ code: "BATCH_NOT_FOUND", message: `Batch ${batchNo} not found for ${product.sku}` });
      return [await this.applyMovement(l, { product, warehouseId, quantity: neg(quantity), batchId: batch.id, batchNo, type })];
    }

    const balances = await l.tx.$queryRaw<{ batchId: string; batchNo: string; quantity: Dec }[]>`
      SELECT bb."batchId", b."batchNo", bb.quantity FROM "BatchBalance" bb
      JOIN "Batch" b ON b.id = bb."batchId"
      WHERE bb."warehouseId" = ${warehouseId}::uuid AND b."productId" = ${product.id}::uuid AND bb.quantity > 0
      ORDER BY b."expiryDate" ASC NULLS LAST, b."createdAt" ASC
      FOR UPDATE OF bb`;
    const results: MovementResult[] = [];
    let remaining = quantity;
    for (const bal of balances) {
      if (remaining.lte(0)) break;
      const take = Prisma.Decimal.min(D(bal.quantity), remaining);
      results.push(await this.applyMovement(l, { product, warehouseId, quantity: neg(take), batchId: bal.batchId, batchNo: bal.batchNo, type }));
      remaining = remaining.sub(take);
    }
    if (remaining.gt(0)) {
      if (!l.allowNegative) throw insufficient(product, quantity.sub(remaining));
      results.push(await this.applyMovement(l, { product, warehouseId, quantity: neg(remaining), type }));
    }
    return results;
  }

  // ─── Documents ─────────────────────────────────────────────────────────────

  private assertPermission(ctx: RequestContext, permission: string) {
    if (!ctx.user.permissions.includes(permission)) throw new ForbiddenException({ message: "You do not have permission to do this", code: "FORBIDDEN" });
  }

  /** Public endpoint: validates a user-entered stock document, then posts it atomically. */
  async post(ctx: RequestContext, input: StockDocumentInput): Promise<string> {
    this.assertPermission(ctx, STOCK_DOCUMENT_PERMISSIONS[input.type]);
    const prepared = await this.prepare(ctx.user.organizationId, {
      type: input.type,
      warehouseId: input.warehouseId,
      toWarehouseId: input.type === "transfer" ? input.toWarehouseId : null,
      partnerId: "partnerId" in input ? input.partnerId : null,
      reference: input.reference,
      reason: "reason" in input ? input.reason : null,
      note: input.note,
      documentDate: input.documentDate,
      lines: input.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitCost: "unitCost" in l ? l.unitCost : undefined,
        batchNo: l.batchNo,
        expiryDate: "expiryDate" in l ? l.expiryDate : null,
        note: l.note,
      })),
    });
    const result = await this.prisma.$transaction((tx) => this.postInTx(tx, ctx, prepared), { timeout: 30_000, maxWait: 10_000 });
    return result.id;
  }

  /**
   * Validates warehouses, partner and products for a posting. Separate from `postInTx`
   * so other services (purchasing, sales) can prepare outside and post inside their own transaction.
   */
  async prepare(organizationId: string, spec: PostSpec): Promise<PreparedPosting> {
    const db = this.prisma.tenant(organizationId);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

    if (spec.type === "transfer" && !org.modules.includes("multiWarehouse")) {
      throw new ForbiddenException({ code: "MODULE_DISABLED", message: "Turn on the Multi-warehouse module to transfer stock" });
    }

    const warehouseIds = [spec.warehouseId, ...(spec.toWarehouseId ? [spec.toWarehouseId] : [])];
    const warehouses = await db.warehouse.findMany({ where: { id: { in: warehouseIds }, active: true }, select: { id: true } });
    if (warehouses.length !== new Set(warehouseIds).size)
      throw new BadRequestException({ code: "WAREHOUSE_INVALID", message: "Warehouse not found or inactive" });

    if (spec.partnerId) {
      const expected = SUPPLIER_DOCS.has(spec.type) ? "supplier" : "customer";
      const partner = await db.partner.findUnique({ where: { id: spec.partnerId } });
      if (!partner || partner.type !== expected) throw new BadRequestException({ code: "PARTNER_INVALID", message: `Choose a valid ${expected}` });
    }

    const productIds = [...new Set(spec.lines.map((l) => l.productId))];
    const products = await db.product.findMany({ where: { id: { in: productIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const id of productIds) {
      const p = byId.get(id);
      if (!p) throw new BadRequestException({ code: "PRODUCT_INVALID", message: "Product not found" });
      if (!p.active) throw new BadRequestException({ code: "PRODUCT_INACTIVE", message: `${p.sku} is inactive` });
      if (p.type !== "stock") throw new BadRequestException({ code: "PRODUCT_NOT_STOCKED", message: `${p.sku} is a service and has no stock` });
    }
    const info = new Map<string, ProductInfo>(
      products.map((p) => [p.id, { id: p.id, sku: p.sku, name: p.name, costPrice: D(p.costPrice), trackBatches: p.trackBatches }]),
    );
    return { organizationId, spec, products: info, valuation: org.valuationMethod, allowNegative: org.allowNegativeStock };
  }

  /** Posts a prepared document inside the caller's transaction: document, ledger movements and journal. */
  async postInTx(tx: Prisma.TransactionClient, ctx: RequestContext, prepared: PreparedPosting): Promise<PostResult> {
    const { spec, organizationId: orgId } = prepared;
    // Lock rows in a stable order to avoid deadlocks between concurrent postings.
    const lines = spec.lines
      .map((line, index) => ({ ...line, index }))
      .sort((a, b) => a.productId.localeCompare(b.productId) || (a.batchNo ?? "").localeCompare(b.batchNo ?? ""));

    const number = await nextNumber(tx, orgId, SEQUENCES[spec.type]);
    const doc = await tx.stockDocument.create({
      data: {
        organizationId: orgId,
        type: spec.type,
        status: spec.type === "transfer" ? "in_transit" : "posted",
        number,
        warehouseId: spec.warehouseId,
        toWarehouseId: spec.toWarehouseId ?? null,
        partnerId: spec.partnerId ?? null,
        orderId: spec.orderId ?? null,
        reference: spec.reference ?? null,
        reason: spec.reason ?? null,
        note: spec.note ?? null,
        documentDate: spec.documentDate ? new Date(spec.documentDate) : new Date(),
        createdById: ctx.user.id,
      },
    });
    const l: Ledger = {
      tx,
      organizationId: orgId,
      userId: ctx.user.id,
      documentId: doc.id,
      valuation: prepared.valuation,
      allowNegative: prepared.allowNegative,
    };
    let inValue = ZERO;
    let outValue = ZERO;
    const lineRows: Prisma.StockDocumentLineCreateManyInput[] = [];
    const lineResults: PostResult["lines"] = [];

    for (const line of lines) {
      const product = prepared.products.get(line.productId)!;
      const qty = D(line.quantity);
      const unitCost = line.unitCost !== undefined && line.unitCost !== null ? D(line.unitCost) : undefined;
      const expiryDate = line.expiryDate ?? null;
      let results: MovementResult[] = [];
      let systemQuantity: Dec | null = null;
      const wh = spec.warehouseId;

      switch (spec.type) {
        case "stock_in":
        case "grn":
        case "return_inward":
          results = await this.receive(
            l,
            product,
            wh,
            { quantity: qty, unitCost: spec.type === "return_inward" ? unitCost : (unitCost ?? product.costPrice), batchNo: line.batchNo, expiryDate },
            RECEIPT_TYPE[spec.type],
          );
          break;
        case "stock_out":
        case "delivery":
        case "return_outward":
        case "transfer":
          results = await this.issue(l, product, wh, qty, line.batchNo, ISSUE_TYPE[spec.type]);
          break;
        case "adjustment":
          results = qty.gt(0)
            ? await this.receive(l, product, wh, { quantity: qty, unitCost, batchNo: line.batchNo, expiryDate }, "adjustment_in")
            : await this.issue(l, product, wh, qty.neg(), line.batchNo, "adjustment_out");
          break;
        case "count": {
          if (product.trackBatches && !line.batchNo) {
            throw new BadRequestException({
              code: "BATCH_REQUIRED",
              message: `${product.sku} is batch-tracked: count each batch separately`,
              productId: product.id,
            });
          }
          if (product.trackBatches) {
            const batch = await this.findOrCreateBatch(l, product, line.batchNo!);
            systemQuantity = (await this.lockBatchBalance(l, batch.id, wh)).quantity;
          } else {
            systemQuantity = (await this.lockLevel(l, product.id, wh)).quantity;
          }
          const delta = qty.sub(systemQuantity);
          if (delta.gt(0)) results = await this.receive(l, product, wh, { quantity: delta, batchNo: line.batchNo }, "adjustment_in");
          if (delta.lt(0)) results = await this.issue(l, product, wh, delta.neg(), line.batchNo, "adjustment_out");
          break;
        }
      }

      for (const r of results) {
        if (r.quantity.gt(0)) inValue = inValue.add(r.totalCost);
        else outValue = outValue.add(r.totalCost.neg());
      }
      const lineValue = results.reduce((sum, r) => sum.add(r.totalCost.abs()), ZERO);
      lineResults.push({ index: line.index, productId: product.id, orderLineId: line.orderLineId ?? null, quantity: qty, value: lineValue });
      lineRows.push({
        documentId: doc.id,
        lineNo: line.index + 1,
        productId: product.id,
        orderLineId: line.orderLineId ?? null,
        quantity: qty,
        systemQuantity,
        unitCost: unitCost ?? (results.length && qty.abs().gt(0) ? round4(lineValue.div(qty.abs())) : null),
        batchNo: line.batchNo,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        note: line.note ?? null,
      });
    }

    const total = inValue.add(outValue);
    await tx.stockDocumentLine.createMany({ data: lineRows.sort((a, b) => a.lineNo - b.lineNo) });
    await tx.stockDocument.update({ where: { id: doc.id }, data: { totalValue: round4(total) } });

    if (spec.journal !== false) {
      const p = spec.partnerId ?? null;
      const outDebit = spec.type === "delivery" || (spec.type === "stock_out" && spec.reason === "sale") ? "cogs" : "inventory_adjustments";
      const journal: Record<string, JournalLineSpec[]> = {
        stock_in: [
          { key: "inventory", debit: inValue },
          { key: "inventory_adjustments", credit: inValue },
        ],
        stock_out: [
          { key: outDebit, debit: outValue },
          { key: "inventory", credit: outValue },
        ],
        adjustment: [
          { key: "inventory", debit: inValue, credit: outValue },
          { key: "inventory_adjustments", debit: outValue, credit: inValue },
        ],
        count: [
          { key: "inventory", debit: inValue, credit: outValue },
          { key: "inventory_adjustments", debit: outValue, credit: inValue },
        ],
        grn: [
          { key: "inventory", debit: inValue },
          { key: "grni", credit: inValue, partnerId: p },
        ],
        delivery: [
          { key: "cogs", debit: outValue },
          { key: "inventory", credit: outValue },
        ],
        return_inward: [
          { key: "inventory", debit: inValue },
          { key: "cogs", credit: inValue },
        ],
      };
      const jl = journal[spec.type];
      if (jl) {
        await this.accounting.post(tx, {
          organizationId: orgId,
          date: doc.documentDate,
          sourceType: `stock.${spec.type}`,
          sourceId: doc.id,
          memo: `${number}${spec.reference ? ` · ${spec.reference}` : ""}`,
          userId: ctx.user.id,
          lines: jl,
        });
      }
    }

    await this.audit.record(
      {
        organizationId: orgId,
        userId: ctx.user.id,
        action: `stock.${spec.type}`,
        entity: "StockDocument",
        entityId: doc.id,
        after: { number, lines: lines.length },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      tx,
    );
    return { id: doc.id, number, total: round4(total), lines: lineResults.sort((a, b) => a.index - b.index) };
  }

  /** Second step of a transfer: books the in-transit quantities into the destination warehouse. */
  async receiveTransfer(ctx: RequestContext, documentId: string): Promise<void> {
    this.assertPermission(ctx, STOCK_DOCUMENT_PERMISSIONS.transfer);
    const orgId = ctx.user.organizationId;
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

    await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ status: string; type: string; toWarehouseId: string | null; number: string }[]>`
          SELECT status, type, "toWarehouseId", number FROM "StockDocument" WHERE id = ${documentId}::uuid AND "organizationId" = ${orgId}::uuid FOR UPDATE`;
        const doc = rows[0];
        if (!doc || doc.type !== "transfer") throw new NotFoundException();
        if (doc.status !== "in_transit" || !doc.toWarehouseId)
          throw new ConflictException({ code: "NOT_IN_TRANSIT", message: "This transfer was already received" });

        const outs = await tx.stockMovement.findMany({
          where: { documentId, type: "transfer_out" },
          include: { product: true },
          orderBy: [{ productId: "asc" }, { createdAt: "asc" }],
        });
        const l: Ledger = { tx, organizationId: orgId, userId: ctx.user.id, documentId, valuation: org.valuationMethod, allowNegative: org.allowNegativeStock };
        for (const m of outs) {
          const product: ProductInfo = {
            id: m.product.id,
            sku: m.product.sku,
            name: m.product.name,
            costPrice: D(m.product.costPrice),
            trackBatches: m.product.trackBatches,
          };
          await this.applyMovement(l, {
            product,
            warehouseId: doc.toWarehouseId,
            quantity: D(m.quantity).neg(),
            unitCost: D(m.unitCost),
            batchId: m.batchId,
            type: "transfer_in",
          });
        }
        await tx.stockDocument.update({ where: { id: documentId }, data: { status: "received", receivedAt: new Date(), receivedById: ctx.user.id } });
        await this.audit.record(
          {
            organizationId: orgId,
            userId: ctx.user.id,
            action: "stock.transfer_received",
            entity: "StockDocument",
            entityId: documentId,
            after: { number: doc.number },
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          },
          tx,
        );
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }
}
