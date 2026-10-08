import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { calcLine, sumLines, type Paginated, type ReturnInput } from "@stockflow/schemas";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AccountingService } from "../finance/accounting.service";
import { nextNumber } from "../inventory/sequence";
import { StockLedgerService } from "../inventory/stock-ledger.service";
import { D, assertCan, assertPartner, auditMeta, invoiceStatus, ssclRateFor, toDate } from "./common";

/**
 * Returns move stock and raise the matching note in one transaction:
 * inward (customer → us) = credit note, outward (us → supplier) = debit note.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounting: AccountingService,
    private readonly ledger: StockLedgerService,
  ) {}

  async listNotes(
    ctx: RequestContext,
    q: { kind: "credit" | "debit"; page: number; pageSize: number; partnerId?: string; search?: string },
  ): Promise<Paginated<unknown>> {
    assertCan(ctx.user, "finance.view", q.kind === "credit" ? "sales.view" : "purchasing.view");
    const db = this.prisma.tenant(ctx.user.organizationId);
    const where: Prisma.NoteWhereInput = {
      kind: q.kind,
      ...(q.partnerId ? { partnerId: q.partnerId } : {}),
      ...(q.search
        ? { OR: [{ number: { contains: q.search, mode: "insensitive" } }, { partner: { name: { contains: q.search, mode: "insensitive" } } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.note.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          partner: { select: { id: true, name: true } },
          invoice: { select: { id: true, number: true } },
          stockDocument: { select: { id: true, number: true } },
        },
      }),
      db.note.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async getNote(ctx: RequestContext, id: string) {
    const note = await this.prisma.tenant(ctx.user.organizationId).note.findUnique({
      where: { id },
      include: {
        partner: true,
        invoice: { select: { id: true, number: true } },
        stockDocument: { select: { id: true, number: true } },
        lines: { orderBy: { lineNo: "asc" }, include: { product: { select: { id: true, sku: true, name: true } } } },
        allocations: { include: { invoice: { select: { id: true, number: true } } } },
      },
    });
    if (!note) throw new NotFoundException();
    assertCan(ctx.user, "finance.view", note.kind === "credit" ? "sales.view" : "purchasing.view");
    return note;
  }

  async create(ctx: RequestContext, input: ReturnInput): Promise<string> {
    const inward = input.kind === "inward";
    assertCan(ctx.user, inward ? "sales.manage" : "purchasing.manage");
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const partner = await assertPartner(db, input.partnerId, inward ? "customer" : "supplier");

    const invoice = input.invoiceId ? await db.invoice.findUnique({ where: { id: input.invoiceId }, include: { lines: true } }) : null;
    if (input.invoiceId && (!invoice || invoice.partnerId !== partner.id || invoice.kind !== (inward ? "sales" : "purchase") || invoice.status === "void")) {
      throw new BadRequestException({ code: "INVOICE_INVALID", message: "Invoice not found for this partner" });
    }

    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const products = new Map((await db.product.findMany({ where: { id: { in: productIds } }, include: { taxRate: true } })).map((p) => [p.id, p]));
    const taxIds = [...new Set(input.lines.map((l) => l.taxRateId).filter(Boolean))] as string[];
    const taxRates = new Map((taxIds.length ? await db.taxRate.findMany({ where: { id: { in: taxIds } } }) : []).map((t) => [t.id, Number(t.rate)]));
    if (taxRates.size !== taxIds.length) throw new BadRequestException({ code: "TAX_INVALID", message: "Tax rate not found" });

    // You can't return more than was invoiced (minus earlier returns against the same invoice).
    if (invoice) {
      const earlier = await db.note.findMany({ where: { invoiceId: invoice.id }, include: { lines: true } });
      for (const l of input.lines) {
        const invoiced = invoice.lines.filter((il) => il.productId === l.productId).reduce((s, il) => s.add(il.quantity), D(0));
        const returned = earlier
          .flatMap((n) => n.lines)
          .filter((nl) => nl.productId === l.productId)
          .reduce((s, nl) => s.add(nl.quantity), D(0));
        if (D(l.quantity).gt(invoiced.sub(returned))) {
          throw new BadRequestException({
            code: "OVER_RETURN",
            message: `Only ${invoiced.sub(returned).toNumber()} of ${products.get(l.productId)?.sku ?? "this item"} can be returned against ${invoice.number}`,
          });
        }
      }
    }

    const ssclRate = inward ? await ssclRateFor(db) : 0;
    const priced = input.lines.map((l) => {
      const product = products.get(l.productId);
      if (!product) throw new BadRequestException({ code: "PRODUCT_INVALID", message: "Product not found" });
      const invLine = invoice?.lines.find((il) => il.productId === l.productId);
      const unitPrice =
        l.unitPrice ??
        (invLine ? D(invLine.subtotal).div(invLine.quantity).toDecimalPlaces(4).toNumber() : Number(inward ? product.sellPrice : product.costPrice));
      const taxRate = l.taxRateId ? taxRates.get(l.taxRateId)! : invLine ? Number(invLine.taxRate) : product.taxRate ? Number(product.taxRate.rate) : 0;
      return { ...l, product, unitPrice, taxRate, amounts: calcLine({ quantity: l.quantity, unitPrice, taxRate }, ssclRate) };
    });
    const totals = sumLines(priced.map((p) => p.amounts));

    const prepared = await this.ledger.prepare(orgId, {
      type: inward ? "return_inward" : "return_outward",
      warehouseId: input.warehouseId,
      partnerId: partner.id,
      reason: input.reason,
      documentDate: input.documentDate,
      journal: inward, // outward returns are booked entirely by the debit note below
      lines: input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, batchNo: l.batchNo })),
    });

    return this.prisma.$transaction(
      async (tx) => {
        const stock = await this.ledger.postInTx(tx, ctx, prepared);
        const number = await nextNumber(tx, orgId, inward ? "creditNote" : "debitNote");
        const noteDate = toDate(input.documentDate);
        const note = await tx.note.create({
          data: {
            organizationId: orgId,
            kind: inward ? "credit" : "debit",
            number,
            partnerId: partner.id,
            invoiceId: invoice?.id ?? null,
            stockDocumentId: stock.id,
            noteDate,
            reason: input.reason,
            subtotal: totals.subtotal,
            taxTotal: totals.tax,
            ssclTotal: totals.sscl,
            total: totals.total,
            createdById: ctx.user.id,
            lines: {
              create: priced.map((p, i) => ({
                lineNo: i + 1,
                productId: p.productId,
                description: p.product.name,
                quantity: p.quantity,
                unitPrice: p.unitPrice,
                taxRate: p.taxRate,
                subtotal: p.amounts.subtotal,
                tax: p.amounts.tax + p.amounts.sscl,
                total: p.amounts.total,
              })),
            },
          },
        });

        const journalId = await this.accounting.post(tx, {
          organizationId: orgId,
          date: noteDate,
          sourceType: inward ? "note.credit" : "note.debit",
          sourceId: note.id,
          memo: `${number} · ${partner.name}`,
          userId: ctx.user.id,
          lines: inward
            ? [
                { key: "sales_returns", debit: totals.subtotal },
                { key: "sscl", debit: totals.sscl },
                { key: "vat_output", debit: totals.tax },
                { key: "ar", credit: totals.total, partnerId: partner.id },
              ]
            : [
                { key: "ap", debit: totals.total, partnerId: partner.id },
                { key: "inventory", credit: stock.total },
                { key: "vat_input", credit: totals.tax },
                // Difference between the credited price and the stock's book cost.
                { key: "ppv", credit: D(totals.subtotal).sub(stock.total) },
              ],
        });
        await tx.note.update({ where: { id: note.id }, data: { journalEntryId: journalId } });

        if (invoice) {
          const rows = await tx.$queryRaw<
            { total: Prisma.Decimal; amountPaid: Prisma.Decimal }[]
          >`SELECT total, "amountPaid" FROM "Invoice" WHERE id = ${invoice.id}::uuid FOR UPDATE`;
          const balance = D(rows[0]!.total).sub(rows[0]!.amountPaid);
          const apply = Prisma.Decimal.min(balance, D(totals.total));
          if (apply.gt(0)) await this.allocate(tx, orgId, note.id, invoice.id, apply);
        }
        await this.audit.record(
          { ...auditMeta(ctx), action: `return.${input.kind}`, entity: "Note", entityId: note.id, after: { number, stock: stock.number, total: totals.total } },
          tx,
        );
        return note.id;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  private async allocate(tx: Prisma.TransactionClient, orgId: string, noteId: string, invoiceId: string, amount: Prisma.Decimal) {
    await tx.allocation.create({ data: { organizationId: orgId, invoiceId, noteId, amount } });
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const paid = D(inv.amountPaid).add(amount);
    await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid: paid, status: invoiceStatus(D(inv.total), paid) } });
    const note = await tx.note.findUniqueOrThrow({ where: { id: noteId } });
    const applied = D(note.amountApplied).add(amount);
    await tx.note.update({ where: { id: noteId }, data: { amountApplied: applied, status: applied.gte(note.total) ? "applied" : "open" } });
  }

  /** Applies the open balance of a credit/debit note to an invoice of the same partner. */
  async apply(ctx: RequestContext, noteId: string, invoiceId: string, amount: number) {
    assertCan(ctx.user, "finance.manage");
    const orgId = ctx.user.organizationId;
    await this.prisma.$transaction(async (tx) => {
      const notes = await tx.$queryRaw<{ id: string; kind: string; partnerId: string; total: Prisma.Decimal; amountApplied: Prisma.Decimal }[]>`
        SELECT id, kind, "partnerId", total, "amountApplied" FROM "Note" WHERE id = ${noteId}::uuid AND "organizationId" = ${orgId}::uuid FOR UPDATE`;
      const note = notes[0];
      if (!note) throw new NotFoundException();
      const invs = await tx.$queryRaw<{ id: string; kind: string; partnerId: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal; status: string }[]>`
        SELECT id, kind, "partnerId", total, "amountPaid", status FROM "Invoice" WHERE id = ${invoiceId}::uuid AND "organizationId" = ${orgId}::uuid FOR UPDATE`;
      const inv = invs[0];
      if (!inv || inv.partnerId !== note.partnerId || inv.kind !== (note.kind === "credit" ? "sales" : "purchase") || inv.status === "void") {
        throw new BadRequestException({ code: "INVOICE_INVALID", message: "Invoice not found for this partner" });
      }
      const noteOpen = D(note.total).sub(note.amountApplied);
      const invOpen = D(inv.total).sub(inv.amountPaid);
      if (D(amount).gt(noteOpen) || D(amount).gt(invOpen))
        throw new ConflictException({ code: "OVER_ALLOCATION", message: `At most ${Prisma.Decimal.min(noteOpen, invOpen).toNumber()} can be applied` });
      await this.allocate(tx, orgId, noteId, invoiceId, D(amount));
      await this.audit.record({ ...auditMeta(ctx), action: "note.applied", entity: "Note", entityId: noteId, after: { invoiceId, amount } }, tx);
    });
  }
}
