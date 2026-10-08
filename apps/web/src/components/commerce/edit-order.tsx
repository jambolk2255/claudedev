"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { OrderDetail } from "@/lib/types";
import { OrderForm } from "./order-form";

export function EditOrder({ id }: { id: string }) {
  const t = useTranslations("commerce.titles");
  const order = useQuery({ queryKey: ["orders", "detail", id], queryFn: () => api<OrderDetail>(`/orders/${id}`) });
  if (!order.data) return <Skeleton className="h-96" />;
  return (
    <>
      <PageHeader level="section" title={t("edit", { number: order.data.number })} />
      <OrderForm kind={order.data.kind} existing={order.data} />
    </>
  );
}
