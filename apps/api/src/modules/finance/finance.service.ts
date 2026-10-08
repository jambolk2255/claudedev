import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JournalInput, Paginated } from "@stockflow/schemas";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AccountingService } from "./accounting.service";

const num = (v: Prisma.Decimal | number | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;
const dayStart = (s?: string) => (s ? new Date(s) : undefined);

export interface DateRange {
  from?: string;
  to?: string;
}

/** Balance sign convention: positive = normal balance for the account type. */
const NORMAL_DEBIT = new Set(["asset", "expense"]);

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
  ) {}

  private async balances(orgId: string, range: DateRange = {}) {
    const rows = await this.prisma.$queryRaw<{ accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[]>`
      SELECT l."accountId", COALESCE(SUM(l.debit), 0) AS debit, COALESCE(SUM(l.credit), 0) AS credit
      FROM "JournalLine" l JOIN "JournalEntry" e ON e.id = l."entryId"
      WHERE l."organizationId" = ${orgId}::uuid
        AND (${range.from ?? null}::date IS NULL OR e."entryDate" >= ${range.from ?? null}::date)
        AND (${range.to ?? null}::date IS NULL OR e."entryDate" <= ${range.to ?? null}::date)
      GROUP BY l."accountId"`;
    return new Map(rows.map((r) => [r.accountId, { debit: num(r.debit), credit: num(r.credit) }]));
  }

  async accounts(orgId: string) {
    await this.prisma.$transaction((tx) => this.accounting.systemAccounts(tx, orgId));
    const [accounts, bal] = await Promise.all([this.prisma.tenant(orgId).account.findMany({ orderBy: { code: "asc" } }), this.balances(orgId)]);
    return accounts.map((a) => {
      const b = bal.get(a.id) ?? { debit: 0, credit: 0 };
      return { ...a, debit: b.debit, credit: b.credit, balance: num(NORMAL_DEBIT.has(a.type) ? b.debit - b.credit : b.credit - b.debit) };
    });
  }

  async createAccount(ctx: RequestContext, input: { code: string; name: string; type: Prisma.AccountCreateInput["type"]; isCash: boolean; active: boolean }) {
    if (input.isCash && input.type !== "asset") throw new BadRequestException({ code: "CASH_ASSET", message: "Cash and bank accounts must be assets" });
    const account = await this.prisma.tenant(ctx.user.organizationId).account.create({ data: { ...input, organizationId: ctx.user.organizationId } });
    await this.audit.record({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.id,
      action: "account.created",
      entity: "Account",
      entityId: account.id,
      after: input,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return account;
  }

  async updateAccount(
    ctx: RequestContext,
    id: string,
    input: { code: string; name: string; type: Prisma.AccountCreateInput["type"]; isCash: boolean; active: boolean },
  ) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    const account = await db.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException();
    if (account.systemKey && (input.type !== account.type || !input.active || input.isCash !== account.isCash)) {
      throw new ConflictException({ code: "SYSTEM_ACCOUNT", message: "System accounts can only be renamed" });
    }
    const updated = await db.account.update({ where: { id }, data: account.systemKey ? { name: input.name, code: input.code } : input });
    await this.audit.record({
      organizationId: ctx.user.organizationId,
      userId: ctx.user.id,
      action: "account.updated",
      entity: "Account",
      entityId: id,
      after: input,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  async journals(orgId: string, q: { page: number; pageSize: number; accountId?: string; search?: string } & DateRange): Promise<Paginated<unknown>> {
    const db = this.prisma.tenant(orgId);
    const where: Prisma.JournalEntryWhereInput = {
      ...(q.accountId ? { lines: { some: { accountId: q.accountId } } } : {}),
      ...(q.from || q.to ? { entryDate: { ...(q.from ? { gte: dayStart(q.from) } : {}), ...(q.to ? { lte: dayStart(q.to) } : {}) } } : {}),
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: "insensitive" } }, { memo: { contains: q.search, mode: "insensitive" } }] } : {}),
    };
    const [items, total] = await Promise.all([
      db.journalEntry.findMany({
        where,
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { lines: { include: { account: { select: { code: true, name: true } }, partner: { select: { name: true } } } } },
      }),
      db.journalEntry.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async postManual(ctx: RequestContext, input: JournalInput) {
    const orgId = ctx.user.organizationId;
    const db = this.prisma.tenant(orgId);
    const ids = [...new Set(input.lines.map((l) => l.accountId))];
    const accounts = await db.account.findMany({ where: { id: { in: ids }, active: true } });
    if (accounts.length !== ids.length) throw new BadRequestException({ code: "ACCOUNT_INVALID", message: "Account not found or inactive" });
    const partnerIds = [...new Set(input.lines.map((l) => l.partnerId).filter(Boolean))] as string[];
    if (partnerIds.length && (await db.partner.count({ where: { id: { in: partnerIds } } })) !== partnerIds.length) {
      throw new BadRequestException({ code: "PARTNER_INVALID", message: "Partner not found" });
    }
    const id = await this.prisma.$transaction(async (tx) => {
      const entryId = await this.accounting.post(tx, {
        organizationId: orgId,
        date: input.entryDate ? new Date(input.entryDate) : new Date(),
        sourceType: "manual",
        memo: input.memo,
        userId: ctx.user.id,
        lines: input.lines.map((l) => ({ accountId: l.accountId, partnerId: l.partnerId ?? null, debit: l.debit, credit: l.credit, memo: l.memo })),
      });
      await this.audit.record(
        {
          organizationId: orgId,
          userId: ctx.user.id,
          action: "journal.manual",
          entity: "JournalEntry",
          entityId: entryId,
          after: { memo: input.memo },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return entryId;
    });
    return db.journalEntry.findUniqueOrThrow({ where: { id: id! }, include: { lines: { include: { account: true } } } });
  }

  async trialBalance(orgId: string, asOf?: string) {
    const accounts = await this.prisma.tenant(orgId).account.findMany({ orderBy: { code: "asc" } });
    const bal = await this.balances(orgId, { to: asOf });
    const rows = accounts
      .map((a) => {
        const b = bal.get(a.id) ?? { debit: 0, credit: 0 };
        const net = num(b.debit - b.credit);
        return { accountId: a.id, code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
      })
      .filter((r) => r.debit || r.credit);
    const totals = { debit: num(rows.reduce((s, r) => s + r.debit, 0)), credit: num(rows.reduce((s, r) => s + r.credit, 0)) };
    return { asOf: asOf ?? null, rows, totals, balanced: totals.debit === totals.credit };
  }

  async profitAndLoss(orgId: string, range: DateRange) {
    const accounts = await this.prisma.tenant(orgId).account.findMany({ where: { type: { in: ["income", "expense"] } }, orderBy: { code: "asc" } });
    const bal = await this.balances(orgId, range);
    const line = (a: (typeof accounts)[number]) => {
      const b = bal.get(a.id) ?? { debit: 0, credit: 0 };
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        systemKey: a.systemKey,
        amount: num(a.type === "income" ? b.credit - b.debit : b.debit - b.credit),
      };
    };
    const income = accounts
      .filter((a) => a.type === "income")
      .map(line)
      .filter((l) => l.amount !== 0);
    const expenses = accounts
      .filter((a) => a.type === "expense")
      .map(line)
      .filter((l) => l.amount !== 0);
    const totalIncome = num(income.reduce((s, l) => s + l.amount, 0));
    const cogs = num(expenses.filter((e) => e.systemKey === "cogs").reduce((s, l) => s + l.amount, 0));
    const totalExpenses = num(expenses.reduce((s, l) => s + l.amount, 0));
    return { ...range, income, expenses, totalIncome, cogs, grossProfit: num(totalIncome - cogs), totalExpenses, netProfit: num(totalIncome - totalExpenses) };
  }

  async balanceSheet(orgId: string, asOf?: string) {
    const accounts = await this.prisma.tenant(orgId).account.findMany({ orderBy: { code: "asc" } });
    const bal = await this.balances(orgId, { to: asOf });
    const amount = (a: (typeof accounts)[number]) => {
      const b = bal.get(a.id) ?? { debit: 0, credit: 0 };
      return num(NORMAL_DEBIT.has(a.type) ? b.debit - b.credit : b.credit - b.debit);
    };
    const section = (type: string) =>
      accounts
        .filter((a) => a.type === type)
        .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: amount(a) }))
        .filter((l) => l.amount !== 0);
    const assets = section("asset");
    const liabilities = section("liability");
    const equity = section("equity");
    const earnings = num(
      accounts.filter((a) => a.type === "income").reduce((s, a) => s + amount(a), 0) -
        accounts.filter((a) => a.type === "expense").reduce((s, a) => s + amount(a), 0),
    );
    const totalAssets = num(assets.reduce((s, l) => s + l.amount, 0));
    const totalLiabilities = num(liabilities.reduce((s, l) => s + l.amount, 0));
    const totalEquity = num(equity.reduce((s, l) => s + l.amount, 0) + earnings);
    return {
      asOf: asOf ?? null,
      assets,
      liabilities,
      equity,
      currentEarnings: earnings,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: num(totalAssets - totalLiabilities - totalEquity) === 0,
    };
  }

  async vatReport(orgId: string, range: DateRange) {
    const accounts = await this.prisma.tenant(orgId).account.findMany({ where: { systemKey: { in: ["vat_output", "vat_input", "sscl"] } } });
    const bal = await this.balances(orgId, range);
    const get = (key: string) => {
      const a = accounts.find((x) => x.systemKey === key);
      return a ? (bal.get(a.id) ?? { debit: 0, credit: 0 }) : { debit: 0, credit: 0 };
    };
    const output = num(get("vat_output").credit - get("vat_output").debit);
    const input = num(get("vat_input").debit - get("vat_input").credit);
    const sscl = num(get("sscl").credit - get("sscl").debit);
    return { ...range, vatOutput: output, vatInput: input, vatPayable: num(output - input), ssclPayable: sscl };
  }

  /** Outstanding invoices bucketed by days past due. */
  async aging(orgId: string, kind: "receivable" | "payable", asOf?: string) {
    const ref = asOf ? new Date(asOf) : new Date(new Date().toISOString().slice(0, 10));
    const invoices = await this.prisma.tenant(orgId).invoice.findMany({
      where: { kind: kind === "receivable" ? "sales" : "purchase", status: { in: ["open", "partially_paid"] }, invoiceDate: { lte: ref } },
      include: { partner: { select: { id: true, code: true, name: true } } },
      orderBy: { dueDate: "asc" },
    });
    const buckets = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
    type Row = { partnerId: string; code: string; name: string; total: number } & Record<(typeof buckets)[number], number>;
    const byPartner = new Map<string, Row>();
    for (const inv of invoices) {
      const open = num(Number(inv.total) - Number(inv.amountPaid));
      if (open <= 0) continue;
      const days = Math.floor((ref.getTime() - inv.dueDate.getTime()) / 86_400_000);
      const bucket = days <= 0 ? "current" : days <= 30 ? "d1_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90_plus";
      const row = byPartner.get(inv.partnerId) ?? {
        partnerId: inv.partnerId,
        code: inv.partner.code,
        name: inv.partner.name,
        total: 0,
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
      };
      row[bucket] = num(row[bucket] + open);
      row.total = num(row.total + open);
      byPartner.set(inv.partnerId, row);
    }
    const rows = [...byPartner.values()].sort((a, b) => b.total - a.total);
    const totals = Object.fromEntries([...buckets, "total"].map((k) => [k, num(rows.reduce((s, r) => s + (r[k as keyof Row] as number), 0))]));
    return { kind, asOf: ref.toISOString().slice(0, 10), rows, totals };
  }

  /** Chronological statement of invoices, payments and notes with a running balance. */
  async statement(orgId: string, partnerId: string, range: DateRange) {
    const db = this.prisma.tenant(orgId);
    const partner = await db.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException();
    const customer = partner.type === "customer";
    const from = range.from ? new Date(range.from) : null;
    const to = range.to ? new Date(range.to) : null;
    const [invoices, payments, notes] = await Promise.all([
      db.invoice.findMany({
        where: { partnerId, status: { not: "void" } },
        select: { id: true, number: true, invoiceDate: true, dueDate: true, total: true, createdAt: true },
      }),
      db.payment.findMany({
        where: { partnerId },
        select: { id: true, number: true, paymentDate: true, amount: true, status: true, method: true, chequeNo: true, createdAt: true },
      }),
      db.note.findMany({ where: { partnerId }, select: { id: true, number: true, noteDate: true, total: true, createdAt: true } }),
    ]);
    type Entry = { date: Date; at: Date; type: string; id: string; number: string; debit: number; credit: number; detail?: string };
    const entries: Entry[] = [
      ...invoices.map((i) => ({
        date: i.invoiceDate,
        at: i.createdAt,
        type: "invoice",
        id: i.id,
        number: i.number,
        debit: customer ? num(i.total) : 0,
        credit: customer ? 0 : num(i.total),
        detail: `due ${i.dueDate.toISOString().slice(0, 10)}`,
      })),
      ...payments.flatMap((p) => {
        const base = { date: p.paymentDate, at: p.createdAt, id: p.id, number: p.number, detail: p.method === "cheque" ? `cheque ${p.chequeNo}` : p.method };
        const pay = { ...base, type: "payment", debit: customer ? 0 : num(p.amount), credit: customer ? num(p.amount) : 0 };
        return p.status === "bounced" ? [pay, { ...base, type: "bounced", debit: pay.credit, credit: pay.debit }] : [pay];
      }),
      ...notes.map((n) => ({
        date: n.noteDate,
        at: n.createdAt,
        type: "note",
        id: n.id,
        number: n.number,
        debit: customer ? 0 : num(n.total),
        credit: customer ? num(n.total) : 0,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.at.getTime() - b.at.getTime());

    let balance = 0;
    let opening = 0;
    const lines: (Entry & { balance: number })[] = [];
    for (const e of entries) {
      // Customers: positive balance = they owe us. Suppliers: positive = we owe them.
      balance = num(balance + (customer ? e.debit - e.credit : e.credit - e.debit));
      if (from && e.date < from) {
        opening = balance;
        continue;
      }
      if (to && e.date > to) continue;
      lines.push({ ...e, balance });
    }
    return {
      partner: { id: partner.id, code: partner.code, name: partner.name, type: partner.type },
      ...range,
      opening,
      closing: lines.length ? lines[lines.length - 1]!.balance : opening,
      lines,
    };
  }

  async summary(orgId: string) {
    const [accounts, ar, ap, overdue, vat, cheques] = await Promise.all([
      this.accounts(orgId),
      this.aging(orgId, "receivable"),
      this.aging(orgId, "payable"),
      this.prisma.tenant(orgId).invoice.aggregate({
        where: { kind: "sales", status: { in: ["open", "partially_paid"] }, dueDate: { lt: new Date(new Date().toISOString().slice(0, 10)) } },
        _sum: { total: true, amountPaid: true },
        _count: true,
      }),
      this.vatReport(orgId, { from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10) }),
      this.prisma.tenant(orgId).payment.aggregate({ where: { chequeStatus: "pending" }, _sum: { amount: true }, _count: true }),
    ]);
    return {
      cashAccounts: accounts.filter((a) => a.isCash).map((a) => ({ id: a.id, code: a.code, name: a.name, balance: a.balance })),
      receivable: ar.totals.total,
      payable: ap.totals.total,
      overdueReceivable: num(Number(overdue._sum.total ?? 0) - Number(overdue._sum.amountPaid ?? 0)),
      overdueInvoices: overdue._count,
      vatPayableThisMonth: vat.vatPayable,
      pendingCheques: { count: cheques._count, amount: num(cheques._sum.amount) },
    };
  }
}
