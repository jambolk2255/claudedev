import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Paginated, PaymentInput, PaymentKind } from "@stockflow/schemas";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AccountingService } from "../finance/accounting.service";
import { nextNumber } from "../inventory/sequence";
import { D, assertCan, assertPartner, auditMeta, invoiceStatus, toDate } from "./common";

export interface PaymentListQuery {
  kind?: PaymentKind;
  page: number;
  pageSize: number;
  search?: string;
  partnerId?: string;
  method?: string;
  chequeStatus?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounting: AccountingService,
  ) {}

  async list(ctx: RequestContext, q: PaymentListQuery): Promise<Paginated<unknown>> {
    assertCan(ctx.user, "finance.view", ...(q.kind === "receipt" ? ["sales.view"] : q.kind === "payment" ? ["purchasing.view"] : []));
    const db = this.prisma.tenant(ctx.user.organizationId);
    const where: Prisma.PaymentWhereInput = {
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.partnerId ? { partnerId: q.partnerId } : {}),
      ...(q.method ? { method: q.method as Prisma.EnumPaymentMethodFilter["equals"] } : {}),
      ...(q.chequeStatus ? { chequeStatus: q.chequeStatus as Prisma.EnumChequeStatusNullableFilter["equals"] } : {}),
      ...(q.search
        ? {
            OR: [
              { number: { contains: q.search, mode: "insensitive" } },
              { chequeNo: { contains: q.search } },
              { partner: { name: { contains: q.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.payment.findMany({
        where,
        orderBy: q.chequeStatus ? { chequeDate: "asc" } : { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { partner: { select: { id: true, name: true } }, account: { select: { id: true, code: true, name: true } } },
      }),
      db.payment.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async get(ctx: RequestContext, id: string) {
    const payment = await this.prisma.tenant(ctx.user.organizationId).payment.findUnique({
      where: { id },
      include: {
        partner: true,
        account: { select: { id: true, code: true, name: true } },
        allocations: { include: { invoice: { select: { id: true, number: true, invoiceDate: true, total: true } } } },
      },
    });
    if (!payment) throw new NotFoundException();
    assertCan(ctx.user, "finance.view", payment.kind === "receipt" ? "sales.view" : "purchasing.view");
    return payment;
  }

  /** Applies amounts of a payment to invoices of the same partner, locking each invoice. */
  private async applyAllocations(
    tx: Prisma.TransactionClient,
    orgId: string,
    payment: { id: string; kind: PaymentKind; partnerId: string; amount: Prisma.Decimal; amountAllocated: Prisma.Decimal },
    allocations: { invoiceId: string; amount: number }[],
  ) {
    let allocated = D(payment.amountAllocated);
    for (const a of [...allocations].sort((x, y) => x.invoiceId.localeCompare(y.invoiceId))) {
      const rows = await tx.$queryRaw<
        { id: string; kind: string; partnerId: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal; status: string; number: string }[]
      >`
        SELECT id, kind, "partnerId", total, "amountPaid", status, number FROM "Invoice"
        WHERE id = ${a.invoiceId}::uuid AND "organizationId" = ${orgId}::uuid FOR UPDATE`;
      const inv = rows[0];
      const expectedKind = payment.kind === "receipt" ? "sales" : "purchase";
      if (!inv || inv.kind !== expectedKind || inv.partnerId !== payment.partnerId || inv.status === "void") {
        throw new BadRequestException({ code: "INVOICE_INVALID", message: "Invoice not found for this partner" });
      }
      const balance = D(inv.total).sub(inv.amountPaid);
      if (D(a.amount).gt(balance))
        throw new BadRequestException({ code: "OVER_ALLOCATION", message: `${inv.number} only has ${balance.toNumber()} outstanding`, invoiceId: inv.id });
      allocated = allocated.add(a.amount);
      if (allocated.gt(payment.amount)) throw new BadRequestException({ code: "ALLOCATION_EXCEEDS_PAYMENT", message: "Allocations exceed the payment amount" });
      await tx.allocation.create({ data: { organizationId: orgId, invoiceId: inv.id, paymentId: payment.id, amount: a.amount } });
      const paid = D(inv.amountPaid).add(a.amount);
      await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: invoiceStatus(D(inv.total), paid) } });
    }
    await tx.payment.update({ where: { id: payment.id }, data: { amountAllocated: allocated } });
  }

  async create(ctx: RequestContext, input: PaymentInput, tx?: Prisma.TransactionClient): Promise<string> {
    assertCan(ctx.user, "finance.manage", ...(input.kind === "receipt" ? ["sales.manage"] : []));
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const partner = await assertPartner(db, input.partnerId, input.kind === "receipt" ? "customer" : "supplier");
    const account = await db.account.findUnique({ where: { id: input.accountId } });
    if (!account || !account.isCash || !account.active) throw new BadRequestException({ code: "ACCOUNT_INVALID", message: "Choose a cash or bank account" });

    const run = async (t: Prisma.TransactionClient) => {
      const number = await nextNumber(t, orgId, input.kind === "receipt" ? "receipt" : "supplierPayment");
      const paymentDate = toDate(input.paymentDate);
      const payment = await t.payment.create({
        data: {
          organizationId: orgId,
          kind: input.kind,
          number,
          partnerId: partner.id,
          paymentDate,
          method: input.method,
          accountId: account.id,
          amount: input.amount,
          reference: input.reference,
          chequeNo: input.method === "cheque" ? input.chequeNo : null,
          chequeDate: input.method === "cheque" && input.chequeDate ? new Date(input.chequeDate) : null,
          chequeStatus: input.method === "cheque" ? "pending" : null,
          notes: input.notes,
          createdById: ctx.user.id,
        },
      });
      if (input.allocations.length) await this.applyAllocations(t, orgId, payment, input.allocations);
      const journalId = await this.accounting.post(t, {
        organizationId: orgId,
        date: paymentDate,
        sourceType: `payment.${input.kind}`,
        sourceId: payment.id,
        memo: `${number} · ${partner.name}`,
        userId: ctx.user.id,
        lines:
          input.kind === "receipt"
            ? [
                { accountId: account.id, debit: input.amount },
                { key: "ar", credit: input.amount, partnerId: partner.id },
              ]
            : [
                { key: "ap", debit: input.amount, partnerId: partner.id },
                { accountId: account.id, credit: input.amount },
              ],
      });
      await t.payment.update({ where: { id: payment.id }, data: { journalEntryId: journalId } });
      await this.audit.record(
        { ...auditMeta(ctx), action: `payment.${input.kind}.created`, entity: "Payment", entityId: payment.id, after: { number, amount: input.amount } },
        t,
      );
      return payment.id;
    };
    return tx ? run(tx) : this.prisma.$transaction(run, { timeout: 30_000 });
  }

  /** Allocate the unallocated part of an existing payment to more invoices. */
  async allocate(ctx: RequestContext, id: string, allocations: { invoiceId: string; amount: number }[]) {
    assertCan(ctx.user, "finance.manage");
    const orgId = ctx.user.organizationId;
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Payment" WHERE id = ${id}::uuid AND "organizationId" = ${orgId}::uuid FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException();
      const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
      if (payment.status !== "posted") throw new ConflictException({ code: "PAYMENT_BOUNCED", message: "This payment bounced" });
      await this.applyAllocations(tx, orgId, payment, allocations);
      await this.audit.record({ ...auditMeta(ctx), action: "payment.allocated", entity: "Payment", entityId: id, after: { allocations } }, tx);
    });
  }

  async clearCheque(ctx: RequestContext, id: string) {
    assertCan(ctx.user, "finance.manage");
    const db = this.prisma.tenant(ctx.user.organizationId);
    const payment = await db.payment.findUnique({ where: { id } });
    if (!payment || payment.method !== "cheque") throw new NotFoundException();
    if (payment.chequeStatus !== "pending") throw new ConflictException({ code: "CHEQUE_NOT_PENDING", message: "This cheque is not pending" });
    await db.payment.update({ where: { id }, data: { chequeStatus: "cleared" } });
    await this.audit.record({ ...auditMeta(ctx), action: "cheque.cleared", entity: "Payment", entityId: id });
  }

  /** A bounced cheque reverses its journal and re-opens the invoices it paid. */
  async bounceCheque(ctx: RequestContext, id: string) {
    assertCan(ctx.user, "finance.manage");
    const orgId = ctx.user.organizationId;
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Payment" WHERE id = ${id}::uuid AND "organizationId" = ${orgId}::uuid FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException();
      const payment = await tx.payment.findUniqueOrThrow({ where: { id }, include: { allocations: true } });
      if (payment.method !== "cheque" || payment.chequeStatus !== "pending")
        throw new ConflictException({ code: "CHEQUE_NOT_PENDING", message: "Only pending cheques can bounce" });
      for (const a of payment.allocations) {
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
        const paid = D(inv.amountPaid).sub(a.amount);
        await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: invoiceStatus(D(inv.total), paid) } });
      }
      await tx.allocation.deleteMany({ where: { paymentId: id } });
      if (payment.journalEntryId)
        await this.accounting.reverse(tx, payment.journalEntryId, "payment.bounced", `Bounced cheque ${payment.chequeNo} (${payment.number})`, ctx.user.id);
      await tx.payment.update({ where: { id }, data: { status: "bounced", chequeStatus: "bounced", amountAllocated: 0 } });
      await this.audit.record({ ...auditMeta(ctx), action: "cheque.bounced", entity: "Payment", entityId: id }, tx);
    });
  }
}
