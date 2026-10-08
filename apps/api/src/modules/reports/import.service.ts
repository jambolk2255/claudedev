import { BadRequestException, Injectable } from "@nestjs/common";
import { partnerInputSchema, productInputSchema, type PartnerType } from "@stockflow/schemas";
import { z } from "zod";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { nextNumber } from "../inventory/sequence";
import { StockLedgerService } from "../inventory/stock-ledger.service";
import { BillingService } from "../billing/billing.service";

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

const MAX_ROWS = 5000;
const n = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? undefined : Number(String(v).replace(/,/g, "")));
const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v).trim() || undefined);
const bool = (v: unknown) =>
  ["1", "yes", "true", "y", "ඔව්"].includes(
    String(v ?? "")
      .trim()
      .toLowerCase(),
  );

/**
 * Spreadsheet imports. Rows arrive as parsed CSV objects (header → value); every row is
 * validated first and nothing is written unless the whole file is valid.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: StockLedgerService,
    private readonly billing: BillingService,
  ) {}

  private assertRows(rows: Record<string, unknown>[]) {
    if (rows.length === 0) throw new BadRequestException({ code: "EMPTY_FILE", message: "The file has no rows" });
    if (rows.length > MAX_ROWS) throw new BadRequestException({ code: "TOO_MANY_ROWS", message: `Import at most ${MAX_ROWS} rows at a time` });
  }

  async products(ctx: RequestContext, rows: Record<string, unknown>[], dryRun: boolean) {
    this.assertRows(rows);
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const [categories, units, taxes, existing] = await Promise.all([
      db.category.findMany(),
      db.unit.findMany(),
      db.taxRate.findMany(),
      db.product.findMany({ select: { id: true, sku: true } }),
    ]);
    const errors: RowError[] = [];
    const parsed: { row: number; data: z.infer<typeof productInputSchema>; category?: string; unit?: string; tax?: string }[] = [];
    const seen = new Set<string>();

    rows.forEach((raw, i) => {
      const row = i + 2; // header is row 1
      const tax = s(raw.tax);
      const result = productInputSchema.safeParse({
        sku: s(raw.sku),
        name: s(raw.name),
        barcode: s(raw.barcode),
        description: s(raw.description),
        type: s(raw.type) === "service" ? "service" : "stock",
        costPrice: n(raw.cost) ?? 0,
        sellPrice: n(raw.price) ?? 0,
        reorderLevel: n(raw.reorder) ?? null,
        maxLevel: n(raw.max) ?? null,
        trackBatches: bool(raw.batches),
      });
      if (!result.success) {
        for (const issue of result.error.issues) errors.push({ row, field: String(issue.path[0] ?? ""), message: issue.message });
        return;
      }
      if (tax && !taxes.some((t) => t.code.toLowerCase() === tax.toLowerCase())) errors.push({ row, field: "tax", message: `Unknown tax code ${tax}` });
      if (result.data.sku) {
        if (seen.has(result.data.sku)) errors.push({ row, field: "sku", message: `Duplicate SKU ${result.data.sku} in file` });
        seen.add(result.data.sku);
      }
      parsed.push({ row, data: result.data, category: s(raw.category), unit: s(raw.unit), tax });
    });

    const creates = parsed.filter((p) => !p.data.sku || !existing.some((e) => e.sku === p.data.sku)).length;
    const summary = { rows: rows.length, valid: parsed.length - new Set(errors.map((e) => e.row)).size, creates, updates: parsed.length - creates, errors };
    if (dryRun || errors.length) return { ...summary, imported: false };
    await this.billing.assertLimit(orgId, "products", creates);

    await this.prisma.$transaction(
      async (tx) => {
        const catIds = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
        const unitIds = new Map(units.map((u) => [u.code.toLowerCase(), u.id]));
        for (const p of parsed) {
          let categoryId: string | null = null;
          if (p.category) {
            categoryId = catIds.get(p.category.toLowerCase()) ?? null;
            if (!categoryId) {
              categoryId = (await tx.category.create({ data: { organizationId: orgId, name: p.category } })).id;
              catIds.set(p.category.toLowerCase(), categoryId);
            }
          }
          let unitId: string | null = null;
          if (p.unit) {
            unitId = unitIds.get(p.unit.toLowerCase()) ?? null;
            if (!unitId) {
              unitId = (await tx.unit.create({ data: { organizationId: orgId, code: p.unit, name: p.unit } })).id;
              unitIds.set(p.unit.toLowerCase(), unitId);
            }
          }
          const taxRateId = p.tax ? (taxes.find((t) => t.code.toLowerCase() === p.tax!.toLowerCase())?.id ?? null) : null;
          const { sku, ...rest } = p.data;
          const data = { ...rest, categoryId, unitId, taxRateId };
          const match = sku ? existing.find((e) => e.sku === sku) : undefined;
          if (match) await tx.product.update({ where: { id: match.id }, data });
          else await tx.product.create({ data: { ...data, organizationId: orgId, sku: sku ?? (await nextNumber(tx, orgId, "product")) } });
        }
        await this.audit.record(
          {
            organizationId: orgId,
            userId: ctx.user.id,
            action: "import.products",
            entity: "Product",
            after: { rows: rows.length },
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          },
          tx,
        );
      },
      { timeout: 120_000 },
    );
    return { ...summary, imported: true };
  }

  async partners(ctx: RequestContext, type: PartnerType, rows: Record<string, unknown>[], dryRun: boolean) {
    this.assertRows(rows);
    const orgId = ctx.user.organizationId;
    const existing = await this.prisma.tenant(orgId).partner.findMany({ where: { type }, select: { id: true, code: true } });
    const errors: RowError[] = [];
    const parsed: { row: number; data: z.infer<typeof partnerInputSchema> }[] = [];
    rows.forEach((raw, i) => {
      const row = i + 2;
      const result = partnerInputSchema.safeParse({
        type,
        code: s(raw.code),
        name: s(raw.name),
        contactName: s(raw.contact),
        email: s(raw.email),
        phone: s(raw.phone),
        taxNo: s(raw.taxNo ?? raw.vat),
        address: s(raw.address),
        city: s(raw.city),
        creditLimit: n(raw.creditLimit) ?? null,
        paymentTermsDays: n(raw.terms) ?? 0,
      });
      if (!result.success) for (const issue of result.error.issues) errors.push({ row, field: String(issue.path[0] ?? ""), message: issue.message });
      else parsed.push({ row, data: result.data });
    });
    const creates = parsed.filter((p) => !p.data.code || !existing.some((e) => e.code === p.data.code)).length;
    const summary = { rows: rows.length, valid: parsed.length, creates, updates: parsed.length - creates, errors };
    if (dryRun || errors.length) return { ...summary, imported: false };
    await this.prisma.$transaction(
      async (tx) => {
        for (const p of parsed) {
          const { code, type: _t, ...data } = p.data;
          const match = code ? existing.find((e) => e.code === code) : undefined;
          if (match) await tx.partner.update({ where: { id: match.id }, data });
          else await tx.partner.create({ data: { ...data, type, organizationId: orgId, code: code ?? (await nextNumber(tx, orgId, type)) } });
        }
        await this.audit.record(
          {
            organizationId: orgId,
            userId: ctx.user.id,
            action: `import.${type}s`,
            entity: "Partner",
            after: { rows: rows.length },
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          },
          tx,
        );
      },
      { timeout: 120_000 },
    );
    return { ...summary, imported: true };
  }

  /** Opening stock: one stock-in document for the whole file. */
  async openingStock(ctx: RequestContext, warehouseId: string, rows: Record<string, unknown>[], dryRun: boolean) {
    this.assertRows(rows);
    const orgId = ctx.user.organizationId;
    const products = await this.prisma.tenant(orgId).product.findMany({ select: { id: true, sku: true, trackBatches: true, type: true, costPrice: true } });
    const bySku = new Map(products.map((p) => [p.sku.toUpperCase(), p]));
    const errors: RowError[] = [];
    const lines: { productId: string; quantity: number; unitCost: number; batchNo: string | null; expiryDate: string | null }[] = [];
    rows.forEach((raw, i) => {
      const row = i + 2;
      const sku = s(raw.sku)?.toUpperCase();
      const product = sku ? bySku.get(sku) : undefined;
      const quantity = n(raw.quantity);
      const unitCost = n(raw.cost);
      const expiry = s(raw.expiry);
      if (!product) return void errors.push({ row, field: "sku", message: `Unknown SKU ${sku ?? ""}` });
      if (product.type !== "stock") return void errors.push({ row, field: "sku", message: `${sku} is a service` });
      if (!quantity || quantity <= 0 || Number.isNaN(quantity)) return void errors.push({ row, field: "quantity", message: "Quantity must be greater than 0" });
      if (unitCost !== undefined && (Number.isNaN(unitCost) || unitCost < 0)) return void errors.push({ row, field: "cost", message: "Invalid cost" });
      if (product.trackBatches && !s(raw.batch)) return void errors.push({ row, field: "batch", message: `${sku} needs a batch number` });
      if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return void errors.push({ row, field: "expiry", message: "Use YYYY-MM-DD" });
      lines.push({
        productId: product.id,
        quantity,
        unitCost: unitCost ?? Number(product.costPrice),
        batchNo: s(raw.batch) ?? null,
        expiryDate: expiry ?? null,
      });
    });
    const keys = lines.map((l) => `${l.productId}|${l.batchNo ?? ""}`);
    if (new Set(keys).size !== keys.length) errors.push({ row: 0, message: "Each SKU/batch can appear only once" });
    const summary = { rows: rows.length, valid: lines.length, creates: lines.length, updates: 0, errors };
    if (dryRun || errors.length) return { ...summary, imported: false };
    const id = await this.ledger.post(ctx, {
      type: "stock_in",
      warehouseId,
      partnerId: null,
      reference: "Opening stock import",
      note: null,
      lines: lines.map((l) => ({ ...l, note: null })),
    });
    return { ...summary, imported: true, documentId: id };
  }
}
