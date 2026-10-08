import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { calcLine, sumLines, type LineAmounts, type OrderKind } from "@stockflow/schemas";
import type { RequestContext, RequestUser } from "../../common/request-user";
import type { TenantClient } from "../../prisma/prisma.service";

export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const today = () => new Date(new Date().toISOString().slice(0, 10));
export const toDate = (v?: string | null) => (v ? new Date(v) : today());
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

export function assertCan(user: RequestUser, ...anyOf: string[]) {
  if (!anyOf.some((p) => user.permissions.includes(p))) throw new ForbiddenException({ message: "You do not have permission to do this", code: "FORBIDDEN" });
}

/** Permission names per order kind. */
export const ORDER_PERMS: Record<OrderKind, { view: string; manage: string; approve: string; fulfil: string }> = {
  purchase: { view: "purchasing.view", manage: "purchasing.manage", approve: "purchasing.approve", fulfil: "purchasing.receive" },
  quotation: { view: "sales.view", manage: "sales.manage", approve: "sales.approve", fulfil: "sales.dispatch" },
  sales: { view: "sales.view", manage: "sales.manage", approve: "sales.approve", fulfil: "sales.dispatch" },
};

export interface PricedLineInput {
  productId?: string | null;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxRateId?: string | null;
}

export interface PricedLine extends PricedLineInput {
  taxRate: number;
  amounts: LineAmounts;
}

/** Resolves tax rates (must belong to the organization) and computes line and document totals. */
export async function priceLines(db: TenantClient, lines: PricedLineInput[], ssclRate: number) {
  const ids = [...new Set(lines.map((l) => l.taxRateId).filter(Boolean))] as string[];
  const rates = ids.length ? await db.taxRate.findMany({ where: { id: { in: ids } } }) : [];
  if (rates.length !== ids.length) throw new BadRequestException({ code: "TAX_INVALID", message: "Tax rate not found" });
  const byId = new Map(rates.map((r) => [r.id, Number(r.rate)]));
  const priced: PricedLine[] = lines.map((l) => {
    const taxRate = l.taxRateId ? byId.get(l.taxRateId)! : 0;
    return { ...l, taxRate, amounts: calcLine({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxRate }, ssclRate) };
  });
  return { lines: priced, totals: sumLines(priced.map((l) => l.amounts)) };
}

/** SSCL percentage when the organization charges it (sales only). */
export async function ssclRateFor(db: TenantClient): Promise<number> {
  const sscl = await db.taxRate.findFirst({ where: { code: "SSCL", active: true } });
  return sscl ? Number(sscl.rate) : 0;
}

export async function assertPartner(db: TenantClient, partnerId: string, type: "customer" | "supplier") {
  const partner = await db.partner.findUnique({ where: { id: partnerId } });
  if (!partner || partner.type !== type || !partner.active) throw new BadRequestException({ code: "PARTNER_INVALID", message: `Choose an active ${type}` });
  return partner;
}

export function auditMeta(ctx: RequestContext) {
  return { organizationId: ctx.user.organizationId, userId: ctx.user.id, ip: ctx.ip, userAgent: ctx.userAgent };
}

/** Outstanding receivable of a customer: open invoices minus unapplied credits and receipts. */
export async function customerBalance(db: TenantClient, partnerId: string): Promise<Prisma.Decimal> {
  const [inv, notes, receipts] = await Promise.all([
    db.invoice.aggregate({ where: { partnerId, kind: "sales", status: { not: "void" } }, _sum: { total: true, amountPaid: true } }),
    db.note.aggregate({ where: { partnerId, kind: "credit" }, _sum: { total: true, amountApplied: true } }),
    db.payment.aggregate({ where: { partnerId, kind: "receipt", status: "posted" }, _sum: { amount: true, amountAllocated: true } }),
  ]);
  const open = D(inv._sum.total ?? 0).sub(D(inv._sum.amountPaid ?? 0));
  const credits = D(notes._sum.total ?? 0).sub(D(notes._sum.amountApplied ?? 0));
  const unallocated = D(receipts._sum.amount ?? 0).sub(D(receipts._sum.amountAllocated ?? 0));
  return open.sub(credits).sub(unallocated);
}

export function invoiceStatus(total: Prisma.Decimal, paid: Prisma.Decimal): "open" | "partially_paid" | "paid" {
  if (paid.gte(total)) return "paid";
  return paid.gt(0) ? "partially_paid" : "open";
}
