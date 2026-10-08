"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

/** In stock / low / out / over badge from on-hand vs reorder and max levels. */
export function StockBadge({ onHand, reorderLevel, maxLevel, service }: { onHand: number; reorderLevel: unknown; maxLevel?: unknown; service?: boolean }) {
  const t = useTranslations("inventory.status");
  if (service) return <Badge variant="outline">{t("service")}</Badge>;
  const reorder = reorderLevel === null || reorderLevel === undefined ? null : Number(reorderLevel);
  const max = maxLevel === null || maxLevel === undefined ? null : Number(maxLevel);
  if (onHand <= 0) return <Badge variant="destructive">{t("out")}</Badge>;
  if (reorder !== null && onHand <= reorder) return <Badge variant="warning">{t("low")}</Badge>;
  if (max !== null && onHand > max) return <Badge variant="secondary">{t("over")}</Badge>;
  return <Badge variant="success">{t("in")}</Badge>;
}
