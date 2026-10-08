"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus, OrderStatus } from "@/lib/types";

export function OrderStatusBadge({ status, overdue }: { status: OrderStatus; overdue?: boolean }) {
  const t = useTranslations("commerce.orderStatus");
  const variant =
    status === "draft"
      ? "outline"
      : status === "cancelled"
        ? "destructive"
        : status === "fulfilled" || status === "closed"
          ? "success"
          : status === "partial"
            ? "warning"
            : "default";
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={variant}>{t(status)}</Badge>
      {overdue && <Badge variant="destructive">{t("overdue")}</Badge>}
    </span>
  );
}

export function InvoiceStatusBadge({ status, dueDate }: { status: InvoiceStatus; dueDate?: string }) {
  const t = useTranslations("commerce.invoiceStatus");
  const overdue = dueDate && (status === "open" || status === "partially_paid") && new Date(dueDate) < new Date(new Date().toISOString().slice(0, 10));
  if (overdue) return <Badge variant="destructive">{t("overdue")}</Badge>;
  const variant = status === "paid" ? "success" : status === "partially_paid" ? "warning" : status === "void" ? "outline" : "secondary";
  return <Badge variant={variant}>{t(status)}</Badge>;
}

export const isOverdue = (status: OrderStatus, expectedDate: string | null) =>
  !!expectedDate && (status === "confirmed" || status === "partial") && new Date(expectedDate) < new Date(new Date().toISOString().slice(0, 10));
