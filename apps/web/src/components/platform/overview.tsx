"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Clock, Hourglass, TrendingUp, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Stat } from "@/components/commerce/ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";

interface Summary {
  tenants: number;
  byStatus: Record<string, number>;
  mrr: number;
  pendingPayments: { count: number; amount: number };
  revenue30d: { count: number; amount: number };
  trialsEndingSoon: number;
}

export function PlatformOverview() {
  const t = useTranslations("platform.overview");
  const ts = useTranslations("billing.status");
  const f = useFormat();
  const q = useQuery({ queryKey: ["platform", "summary"], queryFn: () => api<Summary>("/platform/summary") });
  if (!q.data) return <Skeleton className="h-64" />;
  const s = q.data;
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={Building2} label={t("tenants")} value={s.tenants} />
        <Stat icon={TrendingUp} label={t("mrr")} value={f.money(s.mrr)} hint={t("mrrHint")} />
        <Stat icon={Wallet} label={t("revenue30d")} value={f.money(s.revenue30d.amount)} hint={t("payments", { count: s.revenue30d.count })} />
        <Stat
          icon={Clock}
          label={t("pending")}
          value={f.money(s.pendingPayments.amount)}
          hint={t("payments", { count: s.pendingPayments.count })}
          tone={s.pendingPayments.count ? "warning" : undefined}
        />
        <Stat icon={Hourglass} label={t("trialsEnding")} value={s.trialsEndingSoon} hint={t("trialsEndingHint")} />
      </div>
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <span className="text-muted-foreground mr-2 text-sm">{t("byStatus")}</span>
        {Object.entries(s.byStatus).map(([k, v]) => (
          <Badge key={k} variant="secondary">
            {ts.has(k) ? ts(k) : k} · {v}
          </Badge>
        ))}
        {s.pendingPayments.count > 0 && (
          <Link href="/admin/payments" className="text-primary ml-auto text-sm font-medium hover:underline">
            {t("reviewPayments")}
          </Link>
        )}
      </Card>
    </div>
  );
}
