"use client";

import { useQuery } from "@tanstack/react-query";
import { AlarmClock, ArrowDownLeft, ArrowUpRight, Landmark, Receipt, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Stat } from "@/components/commerce/ui";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";

export interface FinanceSummary {
  cashAccounts: { id: string; code: string; name: string; balance: number }[];
  receivable: number;
  payable: number;
  overdueReceivable: number;
  overdueInvoices: number;
  vatPayableThisMonth: number;
  pendingCheques: { count: number; amount: number };
}

export function FinanceOverview() {
  const t = useTranslations("finance.overview");
  const f = useFormat();
  const q = useQuery({ queryKey: ["finance", "summary"], queryFn: () => api<FinanceSummary>("/finance/summary") });
  if (!q.data) return <Skeleton className="h-72" />;
  const s = q.data;
  const cash = s.cashAccounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Wallet} label={t("cash")} value={f.money(cash)} hint={t("accounts", { count: s.cashAccounts.length })} />
        <Stat
          icon={ArrowDownLeft}
          label={t("receivable")}
          value={f.money(s.receivable)}
          hint={s.overdueInvoices ? t("overdue", { amount: f.money(s.overdueReceivable), count: s.overdueInvoices }) : t("noOverdue")}
          tone={s.overdueInvoices ? "warning" : undefined}
        />
        <Stat icon={ArrowUpRight} label={t("payable")} value={f.money(s.payable)} />
        <Stat icon={Receipt} label={t("vat")} value={f.money(s.vatPayableThisMonth)} hint={t("vatHint")} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Landmark className="text-muted-foreground size-4" /> {t("cashAndBank")}
            </CardTitle>
          </CardHeader>
          <ul className="divide-y border-t">
            {s.cashAccounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="text-muted-foreground mr-2 font-mono text-xs">{a.code}</span>
                  {a.name}
                </span>
                <span className="font-medium tabular-nums">{f.money(a.balance)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <CardTitle className="mb-3 flex items-center gap-2">
            <AlarmClock className="text-muted-foreground size-4" /> {t("attention")}
          </CardTitle>
          <ul className="grid gap-2 text-sm">
            <li>
              <Link href="/finance/receivables" className="hover:bg-muted/60 flex justify-between rounded-md px-2 py-1.5">
                <span>{t("overdueInvoices")}</span>
                <span className="font-medium tabular-nums">{s.overdueInvoices}</span>
              </Link>
            </li>
            <li>
              <Link href="/finance/cheques" className="hover:bg-muted/60 flex justify-between rounded-md px-2 py-1.5">
                <span>{t("pendingCheques")}</span>
                <span className="font-medium tabular-nums">
                  {s.pendingCheques.count} · {f.money(s.pendingCheques.amount)}
                </span>
              </Link>
            </li>
            <li>
              <Link href="/finance/payables" className="hover:bg-muted/60 flex justify-between rounded-md px-2 py-1.5">
                <span>{t("billsToPay")}</span>
                <span className="font-medium tabular-nums">{f.money(s.payable)}</span>
              </Link>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
