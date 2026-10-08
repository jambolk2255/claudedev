import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

export interface ReportRange {
  from: string;
  to: string;
}

/** Read-only analytics over invoices, notes and the stock ledger. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(orgId: string, r: ReportRange, groupBy: "day" | "month" | "product" | "customer") {
    const key =
      groupBy === "day"
        ? Prisma.sql`to_char(i."invoiceDate", 'YYYY-MM-DD')`
        : groupBy === "month"
          ? Prisma.sql`to_char(i."invoiceDate", 'YYYY-MM')`
          : groupBy === "product"
            ? Prisma.sql`COALESCE(p.sku || ' · ' || p.name, l.description)`
            : Prisma.sql`pa.name`;
    const rows = await this.prisma.$queryRaw<
      { key: string; invoices: bigint; quantity: Prisma.Decimal; net: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal }[]
    >`
      SELECT ${key} AS key, COUNT(DISTINCT i.id) AS invoices, SUM(l.quantity) AS quantity, SUM(l.subtotal) AS net, SUM(l.tax) AS tax, SUM(l.total) AS total
      FROM "InvoiceLine" l
      JOIN "Invoice" i ON i.id = l."invoiceId"
      JOIN "Partner" pa ON pa.id = i."partnerId"
      LEFT JOIN "Product" p ON p.id = l."productId"
      WHERE i."organizationId" = ${orgId}::uuid AND i.kind = 'sales' AND i.status <> 'void'
        AND i."invoiceDate" BETWEEN ${r.from}::date AND ${r.to}::date
      GROUP BY 1 ORDER BY ${groupBy === "day" || groupBy === "month" ? Prisma.sql`1` : Prisma.sql`net DESC`}`;
    const returns = await this.prisma.$queryRaw<{ net: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(subtotal), 0) AS net FROM "Note"
      WHERE "organizationId" = ${orgId}::uuid AND kind = 'credit' AND "noteDate" BETWEEN ${r.from}::date AND ${r.to}::date`;
    const out = rows.map((x) => ({
      key: x.key,
      invoices: Number(x.invoices),
      quantity: Number(x.quantity),
      net: num(x.net),
      tax: num(x.tax),
      total: num(x.total),
    }));
    const gross = num(out.reduce((s, x) => s + x.net, 0));
    return { ...r, groupBy, rows: out, totals: { net: gross, returns: num(returns[0]?.net), netAfterReturns: num(gross - Number(returns[0]?.net ?? 0)) } };
  }

  async purchases(orgId: string, r: ReportRange, groupBy: "month" | "product" | "supplier") {
    const key =
      groupBy === "month"
        ? Prisma.sql`to_char(i."invoiceDate", 'YYYY-MM')`
        : groupBy === "product"
          ? Prisma.sql`COALESCE(p.sku || ' · ' || p.name, l.description)`
          : Prisma.sql`pa.name`;
    const rows = await this.prisma.$queryRaw<
      { key: string; bills: bigint; quantity: Prisma.Decimal; net: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal }[]
    >`
      SELECT ${key} AS key, COUNT(DISTINCT i.id) AS bills, SUM(l.quantity) AS quantity, SUM(l.subtotal) AS net, SUM(l.tax) AS tax, SUM(l.total) AS total
      FROM "InvoiceLine" l
      JOIN "Invoice" i ON i.id = l."invoiceId"
      JOIN "Partner" pa ON pa.id = i."partnerId"
      LEFT JOIN "Product" p ON p.id = l."productId"
      WHERE i."organizationId" = ${orgId}::uuid AND i.kind = 'purchase' AND i.status <> 'void'
        AND i."invoiceDate" BETWEEN ${r.from}::date AND ${r.to}::date
      GROUP BY 1 ORDER BY ${groupBy === "month" ? Prisma.sql`1` : Prisma.sql`net DESC`}`;
    const out = rows.map((x) => ({ key: x.key, bills: Number(x.bills), quantity: Number(x.quantity), net: num(x.net), tax: num(x.tax), total: num(x.total) }));
    return { ...r, groupBy, rows: out, totals: { net: num(out.reduce((s, x) => s + x.net, 0)), total: num(out.reduce((s, x) => s + x.total, 0)) } };
  }

  /** Revenue from invoices vs cost of goods from the stock ledger (sales issues net of returns). */
  async margins(orgId: string, r: ReportRange) {
    const revenue = await this.prisma.$queryRaw<{ productId: string; sku: string; name: string; quantity: Prisma.Decimal; revenue: Prisma.Decimal }[]>`
      SELECT p.id AS "productId", p.sku, p.name, SUM(l.quantity) AS quantity, SUM(l.subtotal) AS revenue
      FROM "InvoiceLine" l JOIN "Invoice" i ON i.id = l."invoiceId" JOIN "Product" p ON p.id = l."productId"
      WHERE i."organizationId" = ${orgId}::uuid AND i.kind = 'sales' AND i.status <> 'void' AND i."invoiceDate" BETWEEN ${r.from}::date AND ${r.to}::date
      GROUP BY p.id`;
    const cost = await this.prisma.$queryRaw<{ productId: string; cost: Prisma.Decimal }[]>`
      SELECT m."productId", -SUM(m."totalCost") AS cost FROM "StockMovement" m
      WHERE m."organizationId" = ${orgId}::uuid AND m.type IN ('sale_out', 'return_in')
        AND m."createdAt"::date BETWEEN ${r.from}::date AND ${r.to}::date
      GROUP BY m."productId"`;
    const costBy = new Map(cost.map((c) => [c.productId, num(c.cost)]));
    const rows = revenue
      .map((x) => {
        const rev = num(x.revenue);
        const cogs = costBy.get(x.productId) ?? 0;
        return {
          productId: x.productId,
          sku: x.sku,
          name: x.name,
          quantity: Number(x.quantity),
          revenue: rev,
          cogs,
          margin: num(rev - cogs),
          marginPct: rev ? Math.round(((rev - cogs) / rev) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.margin - a.margin);
    const revenueTotal = num(rows.reduce((s, x) => s + x.revenue, 0));
    const cogsTotal = num(rows.reduce((s, x) => s + x.cogs, 0));
    return {
      ...r,
      rows,
      totals: {
        revenue: revenueTotal,
        cogs: cogsTotal,
        margin: num(revenueTotal - cogsTotal),
        marginPct: revenueTotal ? Math.round(((revenueTotal - cogsTotal) / revenueTotal) * 1000) / 10 : 0,
      },
    };
  }

  async stockValuation(orgId: string, warehouseId?: string) {
    const rows = await this.prisma.$queryRaw<
      { productId: string; sku: string; name: string; category: string | null; unit: string | null; quantity: Prisma.Decimal; value: Prisma.Decimal }[]
    >`
      SELECT p.id AS "productId", p.sku, p.name, c.name AS category, u.code AS unit, SUM(l.quantity) AS quantity, SUM(GREATEST(l.quantity, 0) * l."avgCost") AS value
      FROM "StockLevel" l JOIN "Product" p ON p.id = l."productId"
      LEFT JOIN "Category" c ON c.id = p."categoryId" LEFT JOIN "Unit" u ON u.id = p."unitId"
      WHERE l."organizationId" = ${orgId}::uuid AND (${warehouseId ?? null}::uuid IS NULL OR l."warehouseId" = ${warehouseId ?? null}::uuid)
      GROUP BY p.id, c.name, u.code HAVING SUM(l.quantity) <> 0 ORDER BY value DESC`;
    const out = rows.map((x) => ({
      ...x,
      quantity: Number(x.quantity),
      value: num(x.value),
      avgCost: Number(x.quantity) ? num(Number(x.value) / Number(x.quantity)) : 0,
    }));
    return {
      warehouseId: warehouseId ?? null,
      rows: out,
      totals: { quantity: out.reduce((s, x) => s + x.quantity, 0), value: num(out.reduce((s, x) => s + x.value, 0)) },
    };
  }

  /** Daily sales and purchases for dashboard charts. */
  async trend(orgId: string, days: number) {
    const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const rows = await this.prisma.$queryRaw<{ day: string; kind: string; net: Prisma.Decimal }[]>`
      SELECT to_char("invoiceDate", 'YYYY-MM-DD') AS day, kind::text AS kind, SUM(subtotal) AS net FROM "Invoice"
      WHERE "organizationId" = ${orgId}::uuid AND status <> 'void' AND "invoiceDate" >= ${from}::date
      GROUP BY 1, 2`;
    const series = Array.from({ length: days }, (_, i) => {
      const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      const get = (kind: string) => num(rows.find((x) => x.day === day && x.kind === kind)?.net);
      return { day, sales: get("sales"), purchases: get("purchase") };
    });
    const top = await this.prisma.$queryRaw<{ name: string; revenue: Prisma.Decimal }[]>`
      SELECT p.name, SUM(l.subtotal) AS revenue FROM "InvoiceLine" l JOIN "Invoice" i ON i.id = l."invoiceId" JOIN "Product" p ON p.id = l."productId"
      WHERE i."organizationId" = ${orgId}::uuid AND i.kind = 'sales' AND i.status <> 'void' AND i."invoiceDate" >= ${from}::date
      GROUP BY p.name ORDER BY revenue DESC LIMIT 5`;
    return {
      days,
      series,
      totals: { sales: num(series.reduce((s, x) => s + x.sales, 0)), purchases: num(series.reduce((s, x) => s + x.purchases, 0)) },
      topProducts: top.map((t) => ({ name: t.name, revenue: num(t.revenue) })),
    };
  }
}
