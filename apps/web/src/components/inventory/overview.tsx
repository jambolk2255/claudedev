"use client";

import type { Paginated, StockAlert, StockSummary } from "@stockflow/schemas";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Boxes, CalendarClock, CheckCircle2, Coins, PackageX } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { fadeUp, stagger } from "@/lib/motion";
import type { StockDocumentSummary } from "@/lib/types";
import { AlertRow } from "./alerts-list";
import { DocStatusBadge } from "./documents-list";

export function InventoryOverview() {
  const t = useTranslations("inventory.overview");
  const td = useTranslations("inventory.docTypes");
  const f = useFormat();
  const summary = useQuery({ queryKey: ["stock", "summary"], queryFn: () => api<StockSummary>("/stock/summary") });
  const alerts = useQuery({ queryKey: ["stock", "alerts"], queryFn: () => api<StockAlert[]>("/stock/alerts") });
  const recent = useQuery({ queryKey: ["stock", "documents", "recent"], queryFn: () => api<Paginated<StockDocumentSummary>>("/stock/documents?pageSize=6") });
  const s = summary.data;
  const maxValue = Math.max(1, ...(s?.byWarehouse.map((w) => w.value) ?? [1]));

  const stats = [
    { key: "value", icon: Coins, value: s && <AnimatedNumber value={s.stockValue} format={f.money} />, href: undefined },
    { key: "products", icon: Boxes, value: s && <AnimatedNumber value={s.products} />, href: "/inventory/products" },
    { key: "low", icon: AlertTriangle, value: s && <AnimatedNumber value={s.lowStock} />, href: "/inventory/products?stock=low", warn: (s?.lowStock ?? 0) > 0 },
    {
      key: "out",
      icon: PackageX,
      value: s && <AnimatedNumber value={s.outOfStock} />,
      href: "/inventory/products?stock=out",
      danger: (s?.outOfStock ?? 0) > 0,
    },
    { key: "expiring", icon: CalendarClock, value: s && <AnimatedNumber value={s.expiring} />, warn: (s?.expiring ?? 0) > 0 },
  ];

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((st) => (
          <motion.div key={st.key} variants={fadeUp} className={st.key === "value" ? "col-span-2 md:col-span-1" : undefined}>
            <Card className="h-full p-4">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <st.icon className={st.danger ? "text-destructive size-4" : st.warn ? "text-warning size-4" : "size-4"} />
                {t(`stats.${st.key}`)}
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{st.value ?? <Skeleton className="h-8 w-16" />}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <motion.div variants={fadeUp}>
          <Card className="h-full">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle>{t("alerts")}</CardTitle>
              {(alerts.data?.length ?? 0) > 0 && <span className="text-muted-foreground text-xs tabular-nums">{alerts.data!.length}</span>}
            </CardHeader>
            <CardContent>
              {alerts.isPending ? (
                <div className="grid gap-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-11" />
                  ))}
                </div>
              ) : alerts.data?.length === 0 ? (
                <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                  <CheckCircle2 className="text-success size-4" /> {t("noAlerts")}
                </div>
              ) : (
                <div className="grid max-h-[420px] overflow-y-auto">
                  {alerts.data?.slice(0, 30).map((a, i) => (
                    <AlertRow key={`${a.type}-${a.productId}-${a.batchNo ?? i}`} alert={a} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp} className="grid content-start gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>{t("byWarehouse")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {!s
                ? [0, 1].map((i) => <Skeleton key={i} className="h-10" />)
                : s.byWarehouse.map((w) => (
                    <div key={w.warehouseId} className="grid gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span>
                          {w.name} <span className="text-muted-foreground font-mono text-xs">{w.code}</span>
                        </span>
                        <span className="font-medium tabular-nums">{f.money(w.value)}</span>
                      </div>
                      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                        <motion.div
                          className="bg-primary h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${(w.value / maxValue) * 100}%` }}
                          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                  ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle>{t("recent")}</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/inventory/documents">
                  {t("viewAll")} <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recent.data?.items.length === 0 ? (
                <p className="text-muted-foreground py-4 text-sm">{t("noDocuments")}</p>
              ) : (
                <ul className="divide-y">
                  {recent.data?.items.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/inventory/documents/${d.id}`}
                        className="hover:bg-accent/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5"
                      >
                        <span className="grid leading-tight">
                          <span className="font-mono text-sm font-medium">{d.number}</span>
                          <span className="text-muted-foreground text-xs">
                            {td(d.type)} · {f.date(d.documentDate)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm tabular-nums">{f.money(d.totalValue)}</span>
                          <DocStatusBadge status={d.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
