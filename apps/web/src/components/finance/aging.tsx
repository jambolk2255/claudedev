"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Download, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PaymentSheet } from "@/components/commerce/payment-sheet";
import { downloadCsv } from "@/components/commerce/ui";
import { EmptyState } from "@/components/data/list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
type Bucket = (typeof BUCKETS)[number];
type AgingRow = { partnerId: string; code: string; name: string; total: number } & Record<Bucket, number>;
interface Aging {
  asOf: string;
  rows: AgingRow[];
  totals: Record<Bucket | "total", number>;
}

/** Outstanding receivables or payables by age, with drill-down to a partner statement. */
export function AgingReport({ kind }: { kind: "receivable" | "payable" }) {
  const t = useTranslations("finance.aging");
  const f = useFormat();
  const [partner, setPartner] = useState<{ id: string; name: string } | null>(null);
  const q = useQuery({ queryKey: ["finance", "aging", kind], queryFn: () => api<Aging>(`/finance/aging?kind=${kind}`) });
  if (!q.data) return <Skeleton className="h-72" />;
  const d = q.data;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <span className="text-muted-foreground text-sm">{t("asOf", { date: f.date(d.asOf) })}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={!d.rows.length}
          onClick={() =>
            downloadCsv(`${kind}-aging-${d.asOf}.csv`, [
              [t("partner"), ...BUCKETS.map((b) => t(`buckets.${b}`)), t("total")],
              ...d.rows.map((r) => [r.name, ...BUCKETS.map((b) => r[b]), r.total]),
            ])
          }
        >
          <Download /> {t("export")}
        </Button>
      </div>
      {d.rows.length === 0 ? (
        <EmptyState icon={Banknote} title={t(kind === "receivable" ? "emptyReceivable" : "emptyPayable")} />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("partner")}</TH>
              {BUCKETS.map((b) => (
                <TH key={b} className={cn("text-right", b !== "current" && b !== "d90_plus" && "hidden md:table-cell")}>
                  {t(`buckets.${b}`)}
                </TH>
              ))}
              <TH className="text-right">{t("total")}</TH>
            </TR>
          </THead>
          <TBody>
            {d.rows.map((r) => (
              <TR key={r.partnerId} className="cursor-pointer" onClick={() => setPartner({ id: r.partnerId, name: r.name })}>
                <TD className="text-sm font-medium">{r.name}</TD>
                {BUCKETS.map((b) => (
                  <TD
                    key={b}
                    className={cn(
                      "text-right tabular-nums",
                      b !== "current" && b !== "d90_plus" && "hidden md:table-cell",
                      r[b] === 0 && "text-muted-foreground/50",
                      b !== "current" && r[b] > 0 && "text-destructive",
                    )}
                  >
                    {r[b] ? f.money(r[b]) : "—"}
                  </TD>
                ))}
                <TD className="text-right font-semibold tabular-nums">{f.money(r.total)}</TD>
              </TR>
            ))}
            <TR className="bg-muted/40 hover:bg-muted/40 font-semibold">
              <TD>{t("total")}</TD>
              {BUCKETS.map((b) => (
                <TD key={b} className={cn("text-right tabular-nums", b !== "current" && b !== "d90_plus" && "hidden md:table-cell")}>
                  {f.money(d.totals[b])}
                </TD>
              ))}
              <TD className="text-right tabular-nums">{f.money(d.totals.total)}</TD>
            </TR>
          </TBody>
        </Table>
      )}
      {partner && <StatementSheet partner={partner} kind={kind} onClose={() => setPartner(null)} />}
    </Card>
  );
}

interface Statement {
  partner: { id: string; code: string; name: string; type: "customer" | "supplier" };
  opening: number;
  closing: number;
  lines: {
    date: string;
    type: "invoice" | "payment" | "note" | "bounced";
    id: string;
    number: string;
    debit: number;
    credit: number;
    detail?: string;
    balance: number;
  }[];
}

export function StatementSheet({ partner, kind, onClose }: { partner: { id: string; name: string }; kind: "receivable" | "payable"; onClose: () => void }) {
  const t = useTranslations("finance.statement");
  const tc = useTranslations("common");
  const f = useFormat();
  const can = useCan();
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [pay, setPay] = useState(false);
  const q = useQuery({
    queryKey: ["finance", "statement", partner.id, from, to],
    queryFn: () => api<Statement>(`/finance/statements/${partner.id}?from=${from}&to=${to}`),
  });
  const customer = kind === "receivable";
  const href = (l: Statement["lines"][number]) =>
    l.type === "invoice"
      ? customer
        ? `/sales/invoices/${l.id}`
        : `/purchasing/bills/${l.id}`
      : l.type === "note"
        ? customer
          ? `/sales/returns/${l.id}`
          : `/purchasing/returns/${l.id}`
        : null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={t("title", { name: partner.name })}
        closeLabel={tc("close")}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> {t("print")}
            </Button>
            {(can("finance.manage") || (customer && can("sales.manage"))) && (
              <Button onClick={() => setPay(true)}>
                <Banknote /> {t(customer ? "receive" : "pay")}
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-4">
          <div className="flex gap-2">
            <Input type="date" aria-label={t("from")} value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" aria-label={t("to")} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {!q.data ? (
            <Skeleton className="h-48" />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr className="border-b">
                  <th className="py-2 text-left font-medium">{t("date")}</th>
                  <th className="py-2 text-left font-medium">{t("document")}</th>
                  <th className="py-2 text-right font-medium">{t(customer ? "charges" : "bills")}</th>
                  <th className="py-2 text-right font-medium">{t(customer ? "payments" : "paid")}</th>
                  <th className="py-2 text-right font-medium">{t("balance")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td colSpan={4} className="text-muted-foreground py-2">
                    {t("opening")}
                  </td>
                  <td className="py-2 text-right tabular-nums">{f.money(q.data.opening)}</td>
                </tr>
                {q.data.lines.map((l, i) => {
                  const link = href(l);
                  const charge = customer ? l.debit : l.credit;
                  const settle = customer ? l.credit : l.debit;
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="text-muted-foreground whitespace-nowrap py-2">{f.date(l.date)}</td>
                      <td className="py-2">
                        {link ? (
                          <Link href={link} className="font-mono hover:underline">
                            {l.number}
                          </Link>
                        ) : (
                          <span className="font-mono">{l.number}</span>
                        )}
                        <span className="text-muted-foreground ml-2 text-xs">{t(`types.${l.type}`)}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{charge ? f.money(charge) : ""}</td>
                      <td className="py-2 text-right tabular-nums">{settle ? f.money(settle) : ""}</td>
                      <td className="py-2 text-right font-medium tabular-nums">{f.money(l.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td colSpan={4} className="py-2">
                    {t("closing")}
                  </td>
                  <td className="py-2 text-right tabular-nums">{f.money(q.data.closing)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        {pay && <PaymentSheet kind={customer ? "receipt" : "payment"} partner={partner} open={pay} onOpenChange={setPay} />}
      </SheetContent>
    </Sheet>
  );
}
