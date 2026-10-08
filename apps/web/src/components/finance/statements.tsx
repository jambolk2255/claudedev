"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Printer, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Stat } from "@/components/commerce/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Line = { accountId: string; code: string; name: string; amount: number };
interface Pnl {
  income: Line[];
  expenses: (Line & { systemKey: string | null })[];
  totalIncome: number;
  cogs: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
}
interface BalanceSheet {
  assets: Line[];
  liabilities: Line[];
  equity: Line[];
  currentEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
}
interface TrialBalance {
  rows: { accountId: string; code: string; name: string; type: string; debit: number; credit: number }[];
  totals: { debit: number; credit: number };
  balanced: boolean;
}
interface Vat {
  vatOutput: number;
  vatInput: number;
  vatPayable: number;
  ssclPayable: number;
}

const REPORTS = ["pnl", "balance", "trial", "vat"] as const;
type Report = (typeof REPORTS)[number];
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export function FinancialStatements() {
  const t = useTranslations("finance.statements");
  const [report, setReport] = useState<Report>("pnl");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const pointInTime = report === "balance" || report === "trial";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div role="tablist" className="bg-muted inline-flex flex-wrap rounded-lg p-1">
          {REPORTS.map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={report === r}
              onClick={() => setReport(r)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                report === r ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`tabs.${r}`)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!pointInTime && <Input type="date" className="h-9 w-auto" aria-label={t("from")} value={from} onChange={(e) => setFrom(e.target.value)} />}
          <Input type="date" className="h-9 w-auto" aria-label={pointInTime ? t("asOf") : t("to")} value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> {t("print")}
          </Button>
        </div>
      </div>
      {report === "pnl" && <ProfitAndLoss from={from} to={to} />}
      {report === "balance" && <BalanceSheetView asOf={to} />}
      {report === "trial" && <TrialBalanceView asOf={to} />}
      {report === "vat" && <VatView from={from} to={to} />}
    </div>
  );
}

function Section({ title, lines, total, totalLabel }: { title: string; lines: Line[]; total: number; totalLabel: string }) {
  const f = useFormat();
  return (
    <div className="grid gap-1">
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{title}</p>
      {lines.map((l) => (
        <div key={l.accountId} className="flex justify-between gap-4 py-0.5 text-sm">
          <span>
            <span className="text-muted-foreground mr-2 font-mono text-xs">{l.code}</span>
            {l.name}
          </span>
          <span className="tabular-nums">{f.money(l.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t pt-1 text-sm font-semibold">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{f.money(total)}</span>
      </div>
    </div>
  );
}

function BalancedFlag({ ok }: { ok: boolean }) {
  const t = useTranslations("finance.statements");
  return ok ? (
    <p className="text-success flex items-center gap-1.5 text-sm">
      <CheckCircle2 className="size-4" /> {t("balanced")}
    </p>
  ) : (
    <p className="text-destructive flex items-center gap-1.5 text-sm">
      <TriangleAlert className="size-4" /> {t("unbalanced")}
    </p>
  );
}

function ProfitAndLoss({ from, to }: { from: string; to: string }) {
  const t = useTranslations("finance.statements");
  const f = useFormat();
  const q = useQuery({ queryKey: ["finance", "pnl", from, to], queryFn: () => api<Pnl>(`/finance/profit-and-loss?from=${from}&to=${to}`) });
  if (!q.data) return <Skeleton className="h-72" />;
  const d = q.data;
  const margin = d.totalIncome ? Math.round((d.grossProfit / d.totalIncome) * 1000) / 10 : 0;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("income")} value={f.money(d.totalIncome)} />
        <Stat label={t("grossProfit")} value={f.money(d.grossProfit)} hint={t("margin", { pct: margin })} />
        <Stat label={t("netProfit")} value={f.money(d.netProfit)} tone={d.netProfit < 0 ? "danger" : "success"} />
      </div>
      <Card className="grid gap-6 p-5">
        <Section title={t("income")} lines={d.income} total={d.totalIncome} totalLabel={t("totalIncome")} />
        <Section title={t("expenses")} lines={d.expenses} total={d.totalExpenses} totalLabel={t("totalExpenses")} />
        <div className={cn("flex justify-between border-t-2 pt-2 text-base font-bold", d.netProfit < 0 && "text-destructive")}>
          <span>{t("netProfit")}</span>
          <span className="tabular-nums">{f.money(d.netProfit)}</span>
        </div>
      </Card>
    </div>
  );
}

function BalanceSheetView({ asOf }: { asOf: string }) {
  const t = useTranslations("finance.statements");
  const q = useQuery({ queryKey: ["finance", "balance-sheet", asOf], queryFn: () => api<BalanceSheet>(`/finance/balance-sheet?to=${asOf}`) });
  if (!q.data) return <Skeleton className="h-72" />;
  const d = q.data;
  return (
    <Card className="grid gap-6 p-5 lg:grid-cols-2">
      <Section title={t("assets")} lines={d.assets} total={d.totalAssets} totalLabel={t("totalAssets")} />
      <div className="grid content-start gap-6">
        <Section title={t("liabilities")} lines={d.liabilities} total={d.totalLiabilities} totalLabel={t("totalLiabilities")} />
        <Section
          title={t("equity")}
          lines={[...d.equity, { accountId: "earnings", code: "", name: t("currentEarnings"), amount: d.currentEarnings }]}
          total={d.totalEquity}
          totalLabel={t("totalEquity")}
        />
        <BalancedFlag ok={d.balanced} />
      </div>
    </Card>
  );
}

function TrialBalanceView({ asOf }: { asOf: string }) {
  const t = useTranslations("finance.statements");
  const f = useFormat();
  const q = useQuery({ queryKey: ["finance", "trial-balance", asOf], queryFn: () => api<TrialBalance>(`/finance/trial-balance?to=${asOf}`) });
  if (!q.data) return <Skeleton className="h-72" />;
  const d = q.data;
  return (
    <Card className="grid gap-3 p-5">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr className="border-b">
            <th className="py-2 text-left font-medium">{t("account")}</th>
            <th className="py-2 text-right font-medium">{t("debit")}</th>
            <th className="py-2 text-right font-medium">{t("credit")}</th>
          </tr>
        </thead>
        <tbody>
          {d.rows
            .filter((r) => r.debit || r.credit)
            .map((r) => (
              <tr key={r.accountId} className="border-b last:border-0">
                <td className="py-1.5">
                  <span className="text-muted-foreground mr-2 font-mono text-xs">{r.code}</span>
                  {r.name}
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.debit ? f.money(r.debit) : ""}</td>
                <td className="py-1.5 text-right tabular-nums">{r.credit ? f.money(r.credit) : ""}</td>
              </tr>
            ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="py-2">{t("total")}</td>
            <td className="py-2 text-right tabular-nums">{f.money(d.totals.debit)}</td>
            <td className="py-2 text-right tabular-nums">{f.money(d.totals.credit)}</td>
          </tr>
        </tfoot>
      </table>
      <BalancedFlag ok={d.balanced} />
    </Card>
  );
}

function VatView({ from, to }: { from: string; to: string }) {
  const t = useTranslations("finance.statements");
  const f = useFormat();
  const q = useQuery({ queryKey: ["finance", "vat", from, to], queryFn: () => api<Vat>(`/finance/vat?from=${from}&to=${to}`) });
  if (!q.data) return <Skeleton className="h-40" />;
  const d = q.data;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label={t("vatOutput")} value={f.money(d.vatOutput)} hint={t("vatOutputHint")} />
      <Stat label={t("vatInput")} value={f.money(d.vatInput)} hint={t("vatInputHint")} />
      <Stat
        label={t("vatPayable")}
        value={f.money(d.vatPayable)}
        tone={d.vatPayable > 0 ? "warning" : "success"}
        hint={d.vatPayable < 0 ? t("vatRefund") : undefined}
      />
      <Stat label={t("ssclPayable")} value={f.money(d.ssclPayable)} />
    </div>
  );
}
