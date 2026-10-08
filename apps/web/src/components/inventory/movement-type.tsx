"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { Movement } from "@/lib/types";

export function MovementTypeBadge({ type }: { type: Movement["type"] }) {
  const t = useTranslations("inventory.movementTypes");
  const incoming = type === "stock_in" || type === "adjustment_in" || type === "transfer_in" || type === "opening";
  return <Badge variant={incoming ? "success" : "secondary"}>{t(type)}</Badge>;
}

export function SignedQty({ value, format }: { value: unknown; format: (v: unknown) => string }) {
  const n = Number(value);
  return <span className={n > 0 ? "text-success font-medium" : "font-medium"}>{`${n > 0 ? "+" : ""}${format(n)}`}</span>;
}
