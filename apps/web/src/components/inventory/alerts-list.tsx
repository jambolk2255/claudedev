"use client";

import type { StockAlert } from "@stockflow/schemas";
import { AlertTriangle, CalendarClock, PackageX, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ICON = { out_of_stock: PackageX, low_stock: AlertTriangle, overstock: TrendingUp, expiring: CalendarClock, expired: CalendarClock } as const;
const TONE = {
  out_of_stock: "text-destructive bg-destructive/10",
  expired: "text-destructive bg-destructive/10",
  low_stock: "text-warning-foreground dark:text-warning bg-warning/15",
  expiring: "text-warning-foreground dark:text-warning bg-warning/15",
  overstock: "text-muted-foreground bg-muted",
} as const;

export function AlertRow({ alert, onNavigate }: { alert: StockAlert; onNavigate?: () => void }) {
  const t = useTranslations("inventory.alerts");
  const f = useFormat();
  const Icon = ICON[alert.type];
  const detail =
    alert.type === "expiring" || alert.type === "expired"
      ? t(`detail.${alert.type}`, { batch: alert.batchNo ?? "", date: alert.expiryDate ? f.date(alert.expiryDate) : "", qty: f.qty(alert.quantity) })
      : t(`detail.${alert.type}`, { qty: f.qty(alert.quantity), threshold: alert.threshold === null ? "—" : f.qty(alert.threshold) });
  return (
    <Link
      href={`/inventory/products/${alert.productId}`}
      onClick={onNavigate}
      className="hover:bg-accent/60 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
    >
      <span className={cn("grid size-8 shrink-0 place-content-center rounded-md", TONE[alert.type])}>
        <Icon className="size-4" />
      </span>
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{alert.name}</span>
        <span className="text-muted-foreground truncate text-xs">{detail}</span>
      </span>
      <span className="text-muted-foreground shrink-0 text-[11px] font-medium uppercase">{t(`types.${alert.type}`)}</span>
    </Link>
  );
}
