"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, ClipboardList, Pencil, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { ProductDetail as Detail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MovementTypeBadge, SignedQty } from "./movement-type";
import { ProductFormSheet } from "./product-form";
import { StockBadge } from "./stock-badge";

export function ProductDetail({ id }: { id: string }) {
  const t = useTranslations("inventory.product");
  const f = useFormat();
  const can = useCan();
  const [editing, setEditing] = useState(false);
  const product = useQuery({ queryKey: ["product", id], queryFn: () => api<Detail>(`/products/${id}`) });

  if (product.isPending) return <Skeleton className="h-96" />;
  if (!product.data) return null;
  const p = product.data;
  const avgCost = p.onHand > 0 ? p.stockValue / p.onHand : Number(p.costPrice);
  const margin = Number(p.sellPrice) > 0 ? ((Number(p.sellPrice) - avgCost) / Number(p.sellPrice)) * 100 : null;
  const actions = [
    { type: "stock_in", icon: ArrowDownToLine, perm: "inventory.stock_in" as const },
    { type: "stock_out", icon: ArrowUpFromLine, perm: "inventory.stock_out" as const },
    { type: "adjustment", icon: SlidersHorizontal, perm: "inventory.adjust" as const },
    { type: "count", icon: ClipboardList, perm: "inventory.count" as const },
  ].filter((a) => can(a.perm) && p.type === "stock" && p.active);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <Link href="/inventory/products" className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm">
            <ArrowLeft className="size-3.5" /> {t("back")}
          </Link>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {p.name}
            <StockBadge onHand={p.onHand} reorderLevel={p.reorderLevel} maxLevel={p.maxLevel} service={p.type === "service"} />
            {!p.active && <Badge variant="outline">{t("inactive")}</Badge>}
          </h2>
          <p className="text-muted-foreground text-sm">
            <span className="font-mono">{p.sku}</span>
            {p.barcode && <> · {p.barcode}</>}
            {p.category && <> · {p.category.name}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.type} variant="outline" size="sm" asChild>
              <Link href={`/inventory/documents/new?type=${a.type}&product=${p.id}`}>
                <a.icon /> {t(`actions.${a.type}`)}
              </Link>
            </Button>
          ))}
          {can("products.manage") && (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil /> {t("edit")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t("onHand"), value: `${f.qty(p.onHand)} ${p.unit?.code ?? ""}` },
          { label: t("value"), value: f.money(p.stockValue) },
          { label: t("avgCost"), value: f.money(avgCost), sub: margin !== null ? t("margin", { pct: margin.toFixed(1) }) : undefined },
          {
            label: t("reorder"),
            value: p.reorderLevel != null ? f.qty(p.reorderLevel) : "—",
            sub: p.maxLevel != null ? t("max", { qty: f.qty(p.maxLevel) }) : undefined,
          },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-muted-foreground text-sm">{s.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{s.value}</p>
            {s.sub && <p className="text-muted-foreground mt-0.5 text-xs">{s.sub}</p>}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t("byWarehouse")}</CardTitle>
          </CardHeader>
          <CardContent>
            {p.levels.length === 0 ? (
              <p className="text-muted-foreground py-4 text-sm">{t("noStock")}</p>
            ) : (
              <ul className="divide-y">
                {p.levels.map((l) => (
                  <li key={l.warehouse.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span>
                      {l.warehouse.name} <span className="text-muted-foreground font-mono text-xs">{l.warehouse.code}</span>
                    </span>
                    <span className="text-right">
                      <span className="font-medium tabular-nums">{f.qty(l.quantity)}</span>
                      <span className="text-muted-foreground block text-xs tabular-nums">{f.money(l.value)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {p.trackBatches && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>{t("batches")}</CardTitle>
            </CardHeader>
            <CardContent>
              {p.batches.length === 0 ? (
                <p className="text-muted-foreground py-4 text-sm">{t("noBatches")}</p>
              ) : (
                <ul className="divide-y">
                  {p.batches.map((b) => {
                    const expired = b.expiryDate && new Date(b.expiryDate) < new Date();
                    return (
                      <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="grid">
                          <span className="font-mono font-medium">{b.batchNo}</span>
                          <span className={cn("text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
                            {b.expiryDate ? t("expires", { date: f.date(b.expiryDate) }) : t("noExpiry")}
                          </span>
                        </span>
                        <span className="text-muted-foreground text-right text-xs">
                          {b.balances.map((bb) => (
                            <span key={bb.warehouse.id} className="block">
                              {bb.warehouse.code}: <span className="text-foreground font-medium tabular-nums">{f.qty(bb.quantity)}</span>
                            </span>
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle>{t("history")}</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/inventory/movements?product=${p.id}`}>{t("fullLedger")}</Link>
          </Button>
        </CardHeader>
        {p.movements.length === 0 ? (
          <p className="text-muted-foreground px-5 pb-5 text-sm">{t("noMovements")}</p>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>{t("cols.date")}</TH>
                <TH>{t("cols.type")}</TH>
                <TH>{t("cols.document")}</TH>
                <TH className="hidden sm:table-cell">{t("cols.warehouse")}</TH>
                <TH className="text-right">{t("cols.qty")}</TH>
                <TH className="hidden text-right md:table-cell">{t("cols.cost")}</TH>
                <TH className="text-right">{t("cols.balance")}</TH>
              </TR>
            </THead>
            <TBody>
              {p.movements.map((m) => (
                <TR key={m.id}>
                  <TD className="text-muted-foreground whitespace-nowrap text-xs">{f.dateTime(m.createdAt)}</TD>
                  <TD>
                    <MovementTypeBadge type={m.type} />
                  </TD>
                  <TD>
                    {m.document ? (
                      <Link href={`/inventory/documents/${m.document.id}`} className="text-primary font-mono text-xs hover:underline">
                        {m.document.number}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {m.batch && <span className="text-muted-foreground block text-xs">{m.batch.batchNo}</span>}
                  </TD>
                  <TD className="hidden font-mono text-xs sm:table-cell">{m.warehouse.code}</TD>
                  <TD className="text-right tabular-nums">
                    <SignedQty value={m.quantity} format={f.qty} />
                  </TD>
                  <TD className="text-muted-foreground hidden text-right tabular-nums md:table-cell">{f.money(m.unitCost)}</TD>
                  <TD className="text-right font-medium tabular-nums">{f.qty(m.balanceAfter)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ProductFormSheet open={editing} onOpenChange={setEditing} product={p} />
    </div>
  );
}
