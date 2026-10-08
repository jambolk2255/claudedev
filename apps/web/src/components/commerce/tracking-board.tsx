"use client";

import type { Paginated } from "@stockflow/schemas";
import { useQueries } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { OrderStatus, OrderSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { orderPath } from "./paths";
import { isOverdue } from "./status";

const COLUMNS: { status: OrderStatus; tone: string }[] = [
  { status: "draft", tone: "bg-muted-foreground/40" },
  { status: "confirmed", tone: "bg-primary" },
  { status: "partial", tone: "bg-warning" },
  { status: "fulfilled", tone: "bg-success" },
];

/** Kanban view of open customer and supplier orders, with overdue highlighting. */
export function TrackingBoard() {
  const t = useTranslations("commerce.board");
  const ts = useTranslations("commerce.orderStatus");
  const f = useFormat();
  const can = useCan();
  const [kind, setKind] = useState<"sales" | "purchase">(can("sales.view") ? "sales" : "purchase");
  const columns = useQueries({
    queries: COLUMNS.map((c) => ({
      queryKey: ["orders", "board", kind, c.status],
      queryFn: () => api<Paginated<OrderSummary>>(`/orders?kind=${kind}&status=${c.status}&pageSize=50`),
    })),
  });
  const overdue = columns.flatMap((c) => c.data?.items ?? []).filter((o) => isOverdue(o.status, o.expectedDate)).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="bg-muted inline-flex rounded-lg p-1">
          {(["sales", "purchase"] as const)
            .filter((k) => can(k === "sales" ? "sales.view" : "purchasing.view"))
            .map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                  kind === k ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(k)}
              </button>
            ))}
        </div>
        {overdue > 0 && (
          <Badge variant="destructive">
            <CalendarClock className="size-3" /> {t("overdue", { count: overdue })}
          </Badge>
        )}
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-4">
        {COLUMNS.map((c, i) => {
          const q = columns[i]!;
          return (
            <div key={c.status} className="bg-muted/40 grid min-w-72 snap-start content-start gap-2 rounded-xl border p-2">
              <div className="flex items-center gap-2 px-1.5 py-1 text-sm font-medium">
                <span className={cn("size-2 rounded-full", c.tone)} />
                {ts(c.status)}
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">{q.data?.total ?? ""}</span>
              </div>
              {q.isPending
                ? [0, 1].map((k) => <Skeleton key={k} className="h-20" />)
                : q.data?.items.map((o, idx) => {
                    const late = isOverdue(o.status, o.expectedDate);
                    return (
                      <motion.div key={o.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 10) * 0.02 }}>
                        <Link href={orderPath(o.kind, o.id)}>
                          <Card className={cn("hover:border-primary/40 grid gap-1 p-3 transition-colors", late && "border-destructive/40")}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-medium">{o.number}</span>
                              <span className="text-sm font-semibold tabular-nums">{f.compactMoney(o.total)}</span>
                            </div>
                            <span className="truncate text-sm">{o.partner.name}</span>
                            {o.expectedDate && (
                              <span className={cn("flex items-center gap-1 text-xs", late ? "text-destructive font-medium" : "text-muted-foreground")}>
                                <CalendarClock className="size-3" /> {f.date(o.expectedDate)}
                              </span>
                            )}
                          </Card>
                        </Link>
                      </motion.div>
                    );
                  })}
              {q.data?.items.length === 0 && <p className="text-muted-foreground px-2 py-4 text-center text-xs">{t("empty")}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
