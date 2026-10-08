"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, PackageCheck, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan, useMe } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { StockDocumentDetail } from "@/lib/types";
import { DocStatusBadge } from "./documents-list";
import { MovementTypeBadge, SignedQty } from "./movement-type";

export function DocumentDetail({ id }: { id: string }) {
  const t = useTranslations("inventory.document");
  const td = useTranslations("inventory.docTypes");
  const tr = useTranslations("inventory.reasons");
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const doc = useQuery({ queryKey: ["stock", "document", id], queryFn: () => api<StockDocumentDetail>(`/stock/documents/${id}`) });
  const receive = useMutation({
    mutationFn: () => api<StockDocumentDetail>(`/stock/documents/${id}/receive`, { method: "POST" }),
    onSuccess: (d) => {
      qc.setQueryData(["stock", "document", id], d);
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success(t("receivedToast"));
    },
    onError: (e) => handleFormError(e),
  });

  if (doc.isPending) return <Skeleton className="h-96" />;
  if (!doc.data) return null;
  const d = doc.data;
  const isCount = d.type === "count";
  const showCost = d.type === "stock_in" || d.type === "adjustment";

  const meta = [
    { label: d.type === "transfer" ? t("from") : t("warehouse"), value: `${d.warehouse.name} (${d.warehouse.code})` },
    ...(d.toWarehouse ? [{ label: t("to"), value: `${d.toWarehouse.name} (${d.toWarehouse.code})` }] : []),
    ...(d.partner ? [{ label: d.type === "stock_in" ? t("supplier") : t("customer"), value: d.partner.name }] : []),
    ...(d.reason ? [{ label: t("reason"), value: tr(d.reason) }] : []),
    { label: t("date"), value: f.date(d.documentDate) },
    ...(d.reference ? [{ label: t("reference"), value: d.reference }] : []),
    { label: t("postedBy"), value: `${d.createdBy?.name ?? "—"} · ${f.dateTime(d.createdAt)}` },
    ...(d.receivedAt ? [{ label: t("receivedAt"), value: f.dateTime(d.receivedAt) }] : []),
  ];

  return (
    <div className="grid gap-6 print:gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <Link href="/inventory/documents" className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm print:hidden">
            <ArrowLeft className="size-3.5" /> {t("back")}
          </Link>
          <p className="text-muted-foreground hidden text-sm print:block">{me?.organization.name}</p>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {td(d.type)} <span className="font-mono">{d.number}</span>
            <DocStatusBadge status={d.status} />
          </h2>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> {t("print")}
          </Button>
          {d.status === "in_transit" && can("inventory.transfer") && (
            <Button size="sm" onClick={() => receive.mutate()} loading={receive.isPending}>
              {!receive.isPending && <PackageCheck />} {t("receive")}
            </Button>
          )}
        </div>
      </div>

      {d.status === "in_transit" && (
        <Card className="border-warning/40 bg-warning/5 flex items-center gap-3 p-4 text-sm print:hidden">
          <ArrowRight className="text-warning size-4" />
          {t("inTransitNote", { to: d.toWarehouse?.name ?? "" })}
        </Card>
      )}

      <Card className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {meta.map((m) => (
          <div key={m.label} className="grid gap-0.5">
            <span className="text-muted-foreground text-xs">{m.label}</span>
            <span className="text-sm font-medium">{m.value}</span>
          </div>
        ))}
        {d.note && (
          <div className="grid gap-0.5 sm:col-span-2 lg:col-span-3">
            <span className="text-muted-foreground text-xs">{t("note")}</span>
            <span className="whitespace-pre-line text-sm">{d.note}</span>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>{t("items")}</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH className="w-10">#</TH>
              <TH>{t("cols.product")}</TH>
              <TH>{t("cols.batch")}</TH>
              {isCount && <TH className="text-right">{t("cols.system")}</TH>}
              <TH className="text-right">{isCount ? t("cols.counted") : t("cols.qty")}</TH>
              {isCount && <TH className="text-right">{t("cols.variance")}</TH>}
              {!isCount && <TH className="text-right">{t("cols.unitCost")}</TH>}
              {!isCount && <TH className="text-right">{t("cols.value")}</TH>}
            </TR>
          </THead>
          <TBody>
            {d.lines.map((l) => {
              const qty = Number(l.quantity);
              const variance = l.systemQuantity === null ? null : qty - Number(l.systemQuantity);
              return (
                <TR key={l.id}>
                  <TD className="text-muted-foreground tabular-nums">{l.lineNo}</TD>
                  <TD>
                    <Link href={`/inventory/products/${l.product.id}`} className="font-medium hover:underline">
                      {l.product.name}
                    </Link>
                    <span className="text-muted-foreground block font-mono text-xs">{l.product.sku}</span>
                  </TD>
                  <TD className="text-sm">
                    {l.batchNo ?? <span className="text-muted-foreground">—</span>}
                    {l.expiryDate && <span className="text-muted-foreground block text-xs">{f.date(l.expiryDate)}</span>}
                  </TD>
                  {isCount && <TD className="text-right tabular-nums">{f.qty(l.systemQuantity)}</TD>}
                  <TD className="text-right font-medium tabular-nums">
                    {f.qty(qty)} <span className="text-muted-foreground text-xs font-normal">{l.product.unit?.code}</span>
                  </TD>
                  {isCount && <TD className="text-right tabular-nums">{variance === null ? "—" : <SignedQty value={variance} format={f.qty} />}</TD>}
                  {!isCount && <TD className="text-muted-foreground text-right tabular-nums">{l.unitCost !== null ? f.money(l.unitCost) : "—"}</TD>}
                  {!isCount && <TD className="text-right tabular-nums">{l.unitCost !== null ? f.money(Math.abs(qty) * Number(l.unitCost)) : "—"}</TD>}
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="flex justify-end border-t px-5 py-3 text-sm">
          <span className="text-muted-foreground mr-2">{showCost || d.type === "stock_out" || d.type === "transfer" ? t("total") : t("totalAdjusted")}:</span>
          <span className="font-semibold tabular-nums">{f.money(d.totalValue)}</span>
        </div>
      </Card>

      <Card className="overflow-hidden print:hidden">
        <CardHeader className="pb-3">
          <CardTitle>{t("ledger")}</CardTitle>
        </CardHeader>
        {d.movements.length === 0 ? (
          <p className="text-muted-foreground px-5 pb-5 text-sm">{t("noMovements")}</p>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>{t("cols.type")}</TH>
                <TH>{t("cols.product")}</TH>
                <TH className="hidden sm:table-cell">{t("cols.warehouse")}</TH>
                <TH className="text-right">{t("cols.qty")}</TH>
                <TH className="text-right">{t("cols.unitCost")}</TH>
                <TH className="text-right">{t("cols.balance")}</TH>
              </TR>
            </THead>
            <TBody>
              {d.movements.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <MovementTypeBadge type={m.type} />
                  </TD>
                  <TD className="font-mono text-xs">
                    {m.product.sku}
                    {m.batch && <span className="text-muted-foreground block">{m.batch.batchNo}</span>}
                  </TD>
                  <TD className="hidden font-mono text-xs sm:table-cell">{m.warehouse.code}</TD>
                  <TD className="text-right tabular-nums">
                    <SignedQty value={m.quantity} format={f.qty} />
                  </TD>
                  <TD className="text-muted-foreground text-right tabular-nums">{f.money(m.unitCost)}</TD>
                  <TD className="text-right font-medium tabular-nums">{f.qty(m.balanceAfter)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
