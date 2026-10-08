"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";

export interface Trend {
  days: number;
  series: { day: string; sales: number; purchases: number }[];
  totals: { sales: number; purchases: number };
  topProducts: { name: string; revenue: number }[];
}

export const useTrend = (enabled: boolean) => useQuery({ queryKey: ["reports", "trend", 30], queryFn: () => api<Trend>("/reports/trend?days=30"), enabled });

/** 30-day sales vs purchases area chart with top products. */
export function SalesTrend({ showPurchases }: { showPurchases: boolean }) {
  const t = useTranslations("dashboard.trend");
  const f = useFormat();
  const q = useTrend(true);
  const day = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle>{t("title")}</CardTitle>
        {q.data && <span className="text-sm font-semibold tabular-nums">{f.money(q.data.totals.sales)}</span>}
      </CardHeader>
      <CardContent className="grid gap-4">
        {!q.data ? (
          <Skeleton className="h-52" />
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={q.data.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="trend-sales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="day" tickFormatter={day} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" minTickGap={24} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={56}
                stroke="var(--muted-foreground)"
                tickFormatter={(v: number) => f.compactMoney(v)}
              />
              <Tooltip
                labelFormatter={(d: string) => day(d)}
                formatter={(v: number, name: string) => [f.money(v), t(name as "sales")]}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              {showPurchases && (
                <Area
                  type="monotone"
                  animationDuration={600}
                  dataKey="purchases"
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 3"
                  fill="none"
                  strokeWidth={1.5}
                />
              )}
              <Area type="monotone" animationDuration={600} dataKey="sales" stroke="var(--primary)" fill="url(#trend-sales)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {q.data && q.data.topProducts.length > 0 && (
          <div className="grid gap-1.5">
            <p className="text-muted-foreground text-xs font-medium">{t("top")}</p>
            {q.data.topProducts.map((p) => {
              const pct = (p.revenue / q.data.topProducts[0]!.revenue) * 100;
              return (
                <div key={p.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="tabular-nums">{f.compactMoney(p.revenue)}</span>
                  <div className="bg-muted col-span-2 h-1 overflow-hidden rounded-full">
                    <div className="bg-primary/70 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <Link href="/reports" className="text-primary mt-1 w-fit text-xs hover:underline">
              {t("more")}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
