"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ClipboardCheck, Package, Phone, Truck } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Progress } from "./ui";

interface Tracking {
  number: string;
  status: OrderStatus;
  orderDate: string;
  expectedDate: string | null;
  company: string;
  companyPhone: string | null;
  lines: { name: string; quantity: number; delivered: number }[];
  deliveries: { number: string; documentDate: string }[];
}

/** Customer-facing order status page (shared link, no login). */
export function PublicTracking({ token }: { token: string }) {
  const t = useTranslations("commerce.track");
  const f = useFormat();
  const q = useQuery({ queryKey: ["track", token], queryFn: () => api<Tracking>(`/track/${encodeURIComponent(token)}`), retry: false });
  const o = q.data;
  const steps = [
    { key: "placed", icon: ClipboardCheck, done: true },
    { key: "confirmed", icon: Check, done: !!o && o.status !== "draft" && o.status !== "cancelled" },
    { key: "shipping", icon: Truck, done: !!o && ["partial", "fulfilled", "closed"].includes(o.status) },
    { key: "delivered", icon: Package, done: !!o && (o.status === "fulfilled" || (o.status === "closed" && o.deliveries.length > 0)) },
  ];
  const current = steps.filter((s) => s.done).length - 1;

  return (
    <div className="bg-muted/30 min-h-dvh">
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-2xl gap-4 px-4 py-8">
        {q.isPending ? (
          <Skeleton className="h-64" />
        ) : !o ? (
          <Card className="p-8 text-center">
            <p className="font-medium">{t("notFound")}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t("notFoundBody")}</p>
          </Card>
        ) : (
          <>
            <Card className="grid gap-6 p-6">
              <div className="grid gap-1">
                <p className="text-muted-foreground text-sm">{t("from", { company: o.company })}</p>
                <h1 className="text-2xl font-semibold">
                  {t("order")} <span className="font-mono">{o.number}</span>
                </h1>
                <p className="text-muted-foreground text-sm">
                  {t("placedOn", { date: f.date(o.orderDate) })}
                  {o.expectedDate && ` · ${t("expected", { date: f.date(o.expectedDate) })}`}
                </p>
              </div>
              {o.status === "cancelled" ? (
                <p className="text-destructive font-medium">{t("cancelled")}</p>
              ) : (
                <ol className="grid grid-cols-4 gap-2">
                  {steps.map((s, i) => (
                    <li key={s.key} className="grid justify-items-center gap-2 text-center">
                      <motion.span
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: i * 0.12 }}
                        className={cn(
                          "grid size-10 place-content-center rounded-full border-2",
                          s.done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                          i === current && "ring-primary/20 ring-4",
                        )}
                      >
                        <s.icon className="size-4" />
                      </motion.span>
                      <span className={cn("text-xs", s.done ? "font-medium" : "text-muted-foreground")}>{t(`steps.${s.key}`)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card className="divide-y">
              {o.lines.map((l, i) => (
                <div key={i} className="grid gap-1.5 p-4">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-muted-foreground tabular-nums">{t("deliveredOf", { delivered: f.qty(l.delivered), total: f.qty(l.quantity) })}</span>
                  </div>
                  <Progress value={l.delivered} max={l.quantity} />
                </div>
              ))}
            </Card>
            {o.deliveries.length > 0 && (
              <Card className="p-4">
                <p className="mb-2 text-sm font-medium">{t("deliveries")}</p>
                <ul className="grid gap-1 text-sm">
                  {o.deliveries.map((d) => (
                    <li key={d.number} className="flex justify-between">
                      <span className="font-mono">{d.number}</span>
                      <span className="text-muted-foreground">{f.date(d.documentDate)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {o.companyPhone && (
              <a href={`tel:${o.companyPhone}`} className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 text-sm">
                <Phone className="size-4" /> {t("questions", { phone: o.companyPhone })}
              </a>
            )}
          </>
        )}
      </main>
    </div>
  );
}
