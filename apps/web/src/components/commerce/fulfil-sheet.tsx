"use client";

import { useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { OrderDetail, StockDocumentDetail } from "@/lib/types";
import { todayIso } from "./ui";

type Row = { qty: string; batchNo: string; expiryDate: string };

/** Receive goods (GRN) against a purchase order or deliver a sales order. */
export function FulfilSheet({ order, open, onOpenChange }: { order: OrderDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("commerce.fulfil");
  const tc = useTranslations("common");
  const f = useFormat();
  const qc = useQueryClient();
  const receiving = order.kind === "purchase";
  const lines = order.lines.filter((l) => l.product.type === "stock" && Number(l.quantity) - Number(l.fulfilledQty) > 0);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, { qty: String(Number(l.quantity) - Number(l.fulfilledQty)), batchNo: "", expiryDate: "" }])),
  );
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));

  async function submit() {
    const payload = lines
      .filter((l) => Number(rows[l.id]?.qty) > 0)
      .map((l) => ({ orderLineId: l.id, quantity: Number(rows[l.id]!.qty), batchNo: rows[l.id]!.batchNo || null, expiryDate: rows[l.id]!.expiryDate || null }));
    if (payload.length === 0) return toast.error(t("nothing"));
    const missingBatch = receiving && lines.some((l) => l.product.trackBatches && Number(rows[l.id]?.qty) > 0 && !rows[l.id]?.batchNo);
    if (missingBatch) return toast.error(t("batchRequired"));
    setSaving(true);
    try {
      const doc = await api<StockDocumentDetail>(`/orders/${order.id}/fulfil`, {
        method: "POST",
        body: { documentDate: date, reference: reference || null, lines: payload },
      });
      toast.success(t(receiving ? "received" : "delivered", { number: doc.number }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders"] }),
        qc.invalidateQueries({ queryKey: ["stock"] }),
        qc.invalidateQueries({ queryKey: ["products"] }),
      ]);
      onOpenChange(false);
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={t(receiving ? "titleReceive" : "titleDeliver", { number: order.number })}
        description={t(receiving ? "descReceive" : "descDeliver", { warehouse: order.warehouse.name })}
        closeLabel={tc("close")}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={submit} loading={saving}>
              {!saving && (receiving ? <PackageCheck /> : <Truck />)} {t(receiving ? "submitReceive" : "submitDeliver")}
            </Button>
          </>
        }
      >
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("date")} htmlFor="ff-date">
              <Input id="ff-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t(receiving ? "supplierRef" : "reference")} htmlFor="ff-ref" optional={tc("optional")}>
              <Input id="ff-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3">
            {lines.map((l) => {
              const outstanding = Number(l.quantity) - Number(l.fulfilledQty);
              const r = rows[l.id]!;
              const over = Number(r.qty) > outstanding;
              return (
                <div key={l.id} className="bg-card grid gap-3 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.product.name}</p>
                      <p className="text-muted-foreground font-mono text-xs">{l.product.sku}</p>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
                      {t("outstanding", { qty: f.qty(outstanding), unit: l.product.unit?.code ?? "" })}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label={t("qty")} htmlFor={`ff-q-${l.id}`} error={over ? t("overQty") : undefined}>
                      <Input
                        id={`ff-q-${l.id}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={r.qty}
                        aria-invalid={over}
                        onChange={(e) => set(l.id, { qty: e.target.value })}
                      />
                    </Field>
                    {(l.product.trackBatches || !receiving) && (
                      <Field label={t("batch")} htmlFor={`ff-b-${l.id}`} optional={receiving ? undefined : t("auto")}>
                        <Input id={`ff-b-${l.id}`} value={r.batchNo} maxLength={50} onChange={(e) => set(l.id, { batchNo: e.target.value })} />
                      </Field>
                    )}
                    {receiving && l.product.trackBatches && (
                      <Field label={t("expiry")} htmlFor={`ff-e-${l.id}`} optional={tc("optional")}>
                        <Input id={`ff-e-${l.id}`} type="date" value={r.expiryDate} onChange={(e) => set(l.id, { expiryDate: e.target.value })} />
                      </Field>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
