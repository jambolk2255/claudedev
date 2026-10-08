import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DEFAULT_CHART, type SystemAccountKey } from "@stockflow/schemas";
import { nextNumber } from "../inventory/sequence";

type Dec = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const r2 = (v: Dec) => v.toDecimalPlaces(2);

export interface JournalLineSpec {
  key?: SystemAccountKey;
  accountId?: string;
  partnerId?: string | null;
  debit?: Prisma.Decimal.Value;
  credit?: Prisma.Decimal.Value;
  memo?: string | null;
}

export interface JournalSpec {
  organizationId: string;
  date: Date;
  sourceType: string;
  sourceId?: string | null;
  memo?: string | null;
  userId?: string | null;
  lines: JournalLineSpec[];
}

/**
 * Posts balanced double-entry journals. Business services describe *what* happened with
 * system account keys; this service resolves accounts, nets lines and writes the entry.
 * The database additionally rejects unbalanced entries at commit time.
 */
@Injectable()
export class AccountingService {
  /** Creates the default chart if missing and returns systemKey → account id. */
  async systemAccounts(tx: Prisma.TransactionClient, organizationId: string): Promise<Record<SystemAccountKey, string>> {
    let accounts = await tx.account.findMany({ where: { organizationId, systemKey: { not: null } }, select: { id: true, systemKey: true } });
    if (accounts.length < DEFAULT_CHART.length) {
      await tx.account.createMany({
        data: DEFAULT_CHART.map((a) => ({ organizationId, code: a.code, name: a.name, type: a.type, systemKey: a.systemKey, isCash: !!a.isCash })),
        skipDuplicates: true,
      });
      accounts = await tx.account.findMany({ where: { organizationId, systemKey: { not: null } }, select: { id: true, systemKey: true } });
    }
    return Object.fromEntries(accounts.map((a) => [a.systemKey, a.id])) as Record<SystemAccountKey, string>;
  }

  async post(tx: Prisma.TransactionClient, spec: JournalSpec): Promise<string | null> {
    const keys = await this.systemAccounts(tx, spec.organizationId);
    // Net debits and credits per account+partner so each entry stays compact.
    const net = new Map<string, { accountId: string; partnerId: string | null; amount: Dec; memo: string | null }>();
    for (const line of spec.lines) {
      const accountId = line.accountId ?? (line.key ? keys[line.key] : undefined);
      if (!accountId) throw new BadRequestException({ code: "ACCOUNT_MISSING", message: `No account for ${line.key}` });
      const amount = D(line.debit ?? 0).sub(D(line.credit ?? 0));
      if (amount.isZero()) continue;
      const k = `${accountId}|${line.partnerId ?? ""}`;
      const existing = net.get(k);
      if (existing) existing.amount = existing.amount.add(amount);
      else net.set(k, { accountId, partnerId: line.partnerId ?? null, amount, memo: line.memo ?? null });
    }
    const rows = [...net.values()].map((l) => ({ ...l, amount: r2(l.amount) })).filter((l) => !l.amount.isZero());
    if (rows.length === 0) return null;
    const diff = rows.reduce((s, l) => s.add(l.amount), D(0));
    if (!diff.isZero())
      throw new BadRequestException({ code: "JOURNAL_UNBALANCED", message: `Journal for ${spec.sourceType} is unbalanced by ${diff.toString()}` });

    const number = await nextNumber(tx, spec.organizationId, "journal");
    const entry = await tx.journalEntry.create({
      data: {
        organizationId: spec.organizationId,
        number,
        entryDate: spec.date,
        sourceType: spec.sourceType,
        sourceId: spec.sourceId ?? null,
        memo: spec.memo ?? null,
        createdById: spec.userId ?? null,
      },
    });
    await tx.journalLine.createMany({
      data: rows.map((l) => ({
        organizationId: spec.organizationId,
        entryId: entry.id,
        accountId: l.accountId,
        partnerId: l.partnerId,
        debit: l.amount.gt(0) ? l.amount : 0,
        credit: l.amount.lt(0) ? l.amount.neg() : 0,
        memo: l.memo,
      })),
    });
    return entry.id;
  }

  /** Posts the mirror image of an entry (used when a cheque bounces or a document is voided). */
  async reverse(tx: Prisma.TransactionClient, entryId: string, sourceType: string, memo: string, userId: string | null): Promise<string | null> {
    const entry = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: true } });
    return this.post(tx, {
      organizationId: entry.organizationId,
      date: new Date(),
      sourceType,
      sourceId: entry.sourceId,
      memo,
      userId,
      lines: entry.lines.map((l) => ({ accountId: l.accountId, partnerId: l.partnerId, debit: l.credit, credit: l.debit, memo: l.memo })),
    });
  }
}
