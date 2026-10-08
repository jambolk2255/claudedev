import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { InvoiceInput, InvoiceKind, Paginated } from "@stockflow/schemas";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AccountingService } from "../finance/accounting.service";
import { nextNumber } from "../inventory/sequence";
import { StockLedgerService, type PreparedPosting } from "../inventory/stock-ledger.service";
import { D, addDays, assertCan, assertPartner, auditMeta, customerBalance, priceLines, ssclRateFor, toDate } from "./common";

export interface InvoiceListQuery {
  kind: InvoiceKind;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  partnerId?: string;
  overdue?: boolean;
}

const VIEW = { sales: ["sales.view", "finance.view"], purchase: ["purchasing.view", "finance.view"] } as const;
const MANAGE = { sales: ["sales.manage", "finance.manage"], purchase: ["finance.manage", "purchasing.manage"] } as const;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounting: AccountingService,
    private readonly ledger: StockLedgerService,
  ) {}

  async list(ctx: RequestContext, q: InvoiceListQuery): Promise<Paginated<unknown>> {
    assertCan(ctx.user, ...VIEW[q.kind]);
    const db = this.prisma.tenant(ctx.user.organizationId);
    const where: Prisma.InvoiceWhereInput = {
      kind: q.kind,
      ...(q.status ? { status: q.status as Prisma.EnumInvoiceStatusFilter["equals"] } : {}),
      ...(q.partnerId ? { partnerId: q.partnerId } : {}),
      ...(q.overdue ? { status: { in: ["open", "partially_paid"] }, dueDate: { lt: new Date(new Date().toISOString().slice(0, 10)) } } : {}),
      ...(q.search
        ? {
            OR: [
              { number: { contains: q.search, mode: "insensitive" } },
              { supplierRef: { contains: q.search, mode: "insensitive" } },
              { partner: { name: { contains: q.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.invoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { partner: { select: { id: true, name: true } }, order: { select: { id: true, number: true } } },
      }),
      db.invoice.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async get(ctx: RequestContext, id: string) {
    const invoice = await this.prisma.tenant(ctx.user.organizationId).invoice.findUnique({
      where: { id },
      include: {
        partner: true,
        order: { select: { id: true, number: true } },
        lines: { orderBy: { lineNo: "asc" }, include: { product: { select: { id: true, sku: true, name: true, unit: { select: { code: true } } } } } },
        allocations: {
          orderBy: { createdAt: "asc" },
          include: {
            payment: { select: { id: true, number: true, paymentDate: true, method: true } },
            note: { select: { id: true, number: true, noteDate: true } },
          },
        },
        notesIssued: { select: { id: true, number: true, total: true } },
      },
    });
    if (!invoice) throw new NotFoundException();
    assertCan(ctx.user, ...VIEW[invoice.kind]);
    return invoice;
  }

  /** Creates and posts an invoice or bill (with its journal) — optionally delivering stock (sales). */
  async create(ctx: RequestContext, input: InvoiceInput, opts: { tx?: Prisma.TransactionClient; skipCreditCheck?: boolean } = {}): Promise<string> {
    assertCan(ctx.user, ...MANAGE[input.kind]);
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const partner = await assertPartner(db, input.partnerId, input.kind === "sales" ? "customer" : "supplier");

    const order = input.orderId ? await db.order.findUnique({ where: { id: input.orderId }, include: { lines: true } }) : null;
    if (input.orderId) {
      if (!order || order.kind !== (input.kind === "sales" ? "sales" : "purchase") || order.partnerId !== partner.id) {
        throw new BadRequestException({ code: "ORDER_INVALID", message: "Order not found for this partner" });
      }
      if (!["confirmed", "partial", "fulfilled", "closed"].includes(order.status))
        throw new BadRequestException({ code: "ORDER_NOT_OPEN", message: "Confirm the order first" });
    }
    const orderLines = new Map((order?.lines ?? []).map((l) => [l.id, l]));

    const productIds = [
      ...new Set(input.lines.map((l) => l.productId ?? (l.orderLineId ? orderLines.get(l.orderLineId)?.productId : null)).filter(Boolean)),
    ] as string[];
    const products = new Map((await db.product.findMany({ where: { id: { in: productIds } } })).map((p) => [p.id, p]));

    const lines = input.lines.map((l) => {
      const ol = l.orderLineId ? orderLines.get(l.orderLineId) : undefined;
      if (l.orderLineId && !ol) throw new BadRequestException({ code: "LINE_INVALID", message: "Order line not found" });
      const productId = l.productId ?? ol?.productId ?? null;
      const product = productId ? products.get(productId) : undefined;
      if (productId && !product) throw new BadRequestException({ code: "PRODUCT_INVALID", message: "Product not found" });
      if (ol) {
        // Three-way match for bills: you can only bill stock that was received.
        const limit = input.kind === "purchase" && product?.type === "stock" ? D(ol.fulfilledQty).sub(ol.invoicedQty) : D(ol.quantity).sub(ol.invoicedQty);
        if (D(l.quantity).gt(limit)) {
          throw new BadRequestException({
            code: "OVER_INVOICE",
            message: `Only ${limit.toNumber()} of ${product?.sku ?? "this line"} can be ${input.kind === "purchase" ? "billed (received, not billed)" : "invoiced"}`,
            orderLineId: ol.id,
          });
        }
      } else if (input.kind === "purchase" && product?.type === "stock") {
        throw new BadRequestException({ code: "RECEIVE_FIRST", message: `Receive ${product.sku} with a GRN against a purchase order before billing it` });
      }
      return { ...l, productId, description: l.description ?? product?.name ?? null, taxRateId: l.taxRateId ?? null, ol, product };
    });

    const ssclRate = input.kind === "sales" ? await ssclRateFor(db) : 0;
    const { lines: priced, totals } = await priceLines(db, lines, ssclRate);

    if (
      !opts.skipCreditCheck &&
      input.kind === "sales" &&
      partner.creditLimit &&
      !(input.overrideCreditLimit && ctx.user.permissions.includes("sales.approve"))
    ) {
      const balance = await customerBalance(db, partner.id);
      if (balance.add(totals.total).gt(partner.creditLimit)) {
        throw new BadRequestException({
          code: "CREDIT_LIMIT",
          message: `${partner.name} would exceed the credit limit`,
          balance: balance.toNumber(),
          creditLimit: Number(partner.creditLimit),
        });
      }
    }

    let delivery: PreparedPosting | null = null;
    if (input.kind === "sales" && input.deliverFromWarehouseId) {
      assertCan(ctx.user, "sales.dispatch");
      const stockLines = lines.filter((l) => l.product?.type === "stock");
      if (stockLines.length) {
        delivery = await this.ledger.prepare(orgId, {
          type: "delivery",
          warehouseId: input.deliverFromWarehouseId,
          partnerId: partner.id,
          orderId: order?.id ?? null,
          lines: stockLines.map((l) => ({ productId: l.productId!, quantity: l.quantity, batchNo: null, orderLineId: l.ol?.id ?? null })),
        });
      }
    }

    const invoiceDate = toDate(input.invoiceDate);
    const dueDate = input.dueDate ? new Date(input.dueDate) : addDays(invoiceDate, partner.paymentTermsDays);

    const run = async (tx: Prisma.TransactionClient) => {
      if (order) {
        // Re-check limits under the order lock so concurrent invoices can't double-bill a line.
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id}::uuid FOR UPDATE`;
        const fresh = new Map((await tx.orderLine.findMany({ where: { orderId: order.id } })).map((l) => [l.id, l]));
        for (const l of lines) {
          if (!l.ol) continue;
          const f = fresh.get(l.ol.id)!;
          const limit = input.kind === "purchase" && l.product?.type === "stock" ? D(f.fulfilledQty).sub(f.invoicedQty) : D(f.quantity).sub(f.invoicedQty);
          if (D(l.quantity).gt(limit))
            throw new BadRequestException({ code: "OVER_INVOICE", message: "This order was invoiced by someone else. Reload and try again." });
        }
      }
      const number = await nextNumber(tx, orgId, input.kind === "sales" ? "invoice" : "supplierBill");
      let grniCleared = D(0);
      let stockNet = D(0);
      let otherNet = D(0);
      const rows = priced.map((p, i) => {
        const src = lines[i]!;
        let costAmount: Prisma.Decimal | null = null;
        if (input.kind === "purchase") {
          if (src.ol && src.product?.type === "stock") {
            // GRNI was credited at the order's net unit price when the goods arrived.
            costAmount = D(src.ol.subtotal).div(src.ol.quantity).mul(p.quantity).toDecimalPlaces(2);
            grniCleared = grniCleared.add(costAmount);
            stockNet = stockNet.add(p.amounts.subtotal);
          } else otherNet = otherNet.add(p.amounts.subtotal);
        }
        return {
          lineNo: i + 1,
          productId: p.productId ?? null,
          orderLineId: src.ol?.id ?? null,
          description: p.description ?? "",
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          discountPct: p.discountPct ?? 0,
          taxRateId: p.taxRateId ?? null,
          taxRate: p.taxRate,
          subtotal: p.amounts.subtotal,
          tax: p.amounts.tax + p.amounts.sscl,
          total: p.amounts.total,
          costAmount,
        };
      });

      const invoice = await tx.invoice.create({
        data: {
          organizationId: orgId,
          kind: input.kind,
          number,
          partnerId: partner.id,
          orderId: order?.id ?? null,
          invoiceDate,
          dueDate,
          supplierRef: input.supplierRef,
          subtotal: totals.subtotal,
          discountTotal: totals.discount,
          taxTotal: totals.tax,
          ssclTotal: totals.sscl,
          total: totals.total,
          notes: input.notes,
          createdById: ctx.user.id,
          lines: { create: rows },
        },
      });

      for (const l of lines) if (l.ol) await tx.orderLine.update({ where: { id: l.ol.id }, data: { invoicedQty: { increment: l.quantity } } });

      if (delivery) {
        await this.ledger.postInTx(tx, ctx, delivery);
        for (const l of lines)
          if (l.ol && l.product?.type === "stock") await tx.orderLine.update({ where: { id: l.ol.id }, data: { fulfilledQty: { increment: l.quantity } } });
      }

      const journalId =
        input.kind === "sales"
          ? await this.accounting.post(tx, {
              organizationId: orgId,
              date: invoiceDate,
              sourceType: "invoice.sales",
              sourceId: invoice.id,
              memo: `${number} · ${partner.name}`,
              userId: ctx.user.id,
              lines: [
                { key: "ar", debit: totals.total, partnerId: partner.id },
                { key: "sales", credit: totals.subtotal },
                { key: "sscl", credit: totals.sscl },
                { key: "vat_output", credit: totals.tax },
              ],
            })
          : await this.accounting.post(tx, {
              organizationId: orgId,
              date: invoiceDate,
              sourceType: "invoice.purchase",
              sourceId: invoice.id,
              memo: `${number}${input.supplierRef ? ` (${input.supplierRef})` : ""} · ${partner.name}`,
              userId: ctx.user.id,
              lines: [
                { key: "grni", debit: grniCleared, partnerId: partner.id },
                { key: "ppv", debit: stockNet.sub(grniCleared) },
                { key: "expenses", debit: otherNet },
                { key: "vat_input", debit: totals.tax },
                { key: "ap", credit: totals.total, partnerId: partner.id },
              ],
            });
      await tx.invoice.update({ where: { id: invoice.id }, data: { journalEntryId: journalId } });
      await this.audit.record(
        { ...auditMeta(ctx), action: `invoice.${input.kind}.created`, entity: "Invoice", entityId: invoice.id, after: { number, total: totals.total } },
        tx,
      );
      return invoice.id;
    };
    return opts.tx ? run(opts.tx) : this.prisma.$transaction(run, { timeout: 30_000, maxWait: 10_000 });
  }
}
