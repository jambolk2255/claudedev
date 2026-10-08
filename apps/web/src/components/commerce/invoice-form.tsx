"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCan } from "@/hooks/use-auth";
import { useRouter } from "@/i18n/navigation";
import { ApiError, api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { InvoiceDetail, OrderDetail, Partner, Warehouse } from "@/lib/types";
import { LinesEditor, nextKey, type EditableLine } from "./lines-editor";
import { PartnerPicker } from "./partner-picker";
import { invoicePath } from "./paths";
import { useTaxes } from "./use-taxes";
import { todayIso } from "./ui";

const blank = (): EditableLine => ({ key: nextKey(), product: { id: "", sku: "", name: "" }, quantity: "1", unitPrice: "0", discountPct: "0", taxRateId: "" });

/** Sales invoice or supplier bill, either from an order (remaining quantities) or direct. */
export function InvoiceForm({ kind, orderId }: { kind: "sales" | "purchase"; orderId?: string }) {
  const t = useTranslations("commerce.invoiceForm");
  const tc = useTranslations("common");
  const can = useCan();
  const router = useRouter();
  const qc = useQueryClient();
  const sales = kind === "sales";
  const { taxRates, ssclRate } = useTaxes(kind);
  const order = useQuery({ queryKey: ["orders", "detail", orderId], queryFn: () => api<OrderDetail>(`/orders/${orderId}`), enabled: !!orderId });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses"), enabled: sales });
  const active = (warehouses.data ?? []).filter((w) => w.active);

  const [partner, setPartner] = useState<Partner | null>(null);
  const [lines, setLines] = useState<EditableLine[]>(orderId ? [] : [blank()]);
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [notes, setNotes] = useState("");
  const [deliverNow, setDeliverNow] = useState(!orderId);
  const [warehouseId, setWarehouseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [partnerError, setPartnerError] = useState(false);

  useEffect(() => {
    if (!warehouseId && active.length) setWarehouseId((active.find((w) => w.isDefault) ?? active[0])!.id);
  }, [active, warehouseId]);

  useEffect(() => {
    const o = order.data;
    if (!o) return;
    setPartner(o.partner as unknown as Partner);
    setWarehouseId(o.warehouseId);
    setLines(
      o.lines
        .map((l) => {
          const cap = (!sales && l.product.type === "stock" ? Number(l.fulfilledQty) : Number(l.quantity)) - Number(l.invoicedQty);
          return {
            key: nextKey(),
            orderLineId: l.id,
            product: { id: l.product.id, sku: l.product.sku, name: l.product.name, unit: l.product.unit } as EditableLine["product"],
            quantity: String(Math.max(0, cap)),
            maxQty: cap,
            unitPrice: String(Number(l.unitPrice)),
            discountPct: String(Number(l.discountPct)),
            taxRateId: l.taxRateId ?? "",
          };
        })
        .filter((l) => l.maxQty > 0),
    );
  }, [order.data, sales]);

  async function submit(override = false) {
    if (!partner) return setPartnerError(true);
    const filled = lines.filter((l) => (l.orderLineId || l.product.id) && Number(l.quantity) > 0);
    if (filled.length === 0) return toast.error(t("noLines"));
    if (filled.some((l) => l.maxQty !== undefined && Number(l.quantity) > l.maxQty)) return toast.error(t("overQty"));
    setSaving(true);
    try {
      const inv = await api<InvoiceDetail>("/invoices", {
        method: "POST",
        body: {
          kind,
          partnerId: partner.id,
          orderId: orderId ?? null,
          invoiceDate,
          dueDate: dueDate || null,
          supplierRef: sales ? null : supplierRef || null,
          notes: notes || null,
          deliverFromWarehouseId: sales && deliverNow ? warehouseId : null,
          overrideCreditLimit: override,
          lines: filled.map((l) => ({
            orderLineId: l.orderLineId ?? null,
            productId: l.orderLineId ? null : l.product.id,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice) || 0,
            discountPct: Number(l.discountPct) || 0,
            taxRateId: l.taxRateId || null,
          })),
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["invoices"] }),
        qc.invalidateQueries({ queryKey: ["orders"] }),
        qc.invalidateQueries({ queryKey: ["stock"] }),
      ]);
      toast.success(t(sales ? "createdInvoice" : "createdBill", { number: inv.number }));
      router.push(invoicePath(kind, inv.id));
    } catch (err) {
      if (err instanceof ApiError && err.code === "CREDIT_LIMIT" && can("sales.approve")) {
        toast.error(err.message, { action: { label: t("override"), onClick: () => void submit(true) } });
      } else handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  if (orderId && order.isPending) return <Skeleton className="h-96" />;
  const fromOrder = !!order.data;

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t(sales ? "customer" : "supplier")} htmlFor="i-partner" error={partnerError ? t("partnerRequired") : undefined} className="sm:col-span-2">
          {fromOrder ? (
            <Input id="i-partner" value={`${order.data!.partner.name} · ${order.data!.number}`} disabled />
          ) : (
            <PartnerPicker
              id="i-partner"
              type={sales ? "customer" : "supplier"}
              value={partner}
              invalid={partnerError}
              onSelect={(p) => (setPartner(p), setPartnerError(false))}
            />
          )}
        </Field>
        <Field label={t(sales ? "invoiceDate" : "billDate")} htmlFor="i-date">
          <Input id="i-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </Field>
        <Field label={t("dueDate")} htmlFor="i-due" hint={!dueDate && partner ? t("termsHint", { days: partner.paymentTermsDays }) : undefined}>
          <Input id="i-due" type="date" value={dueDate} min={invoiceDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        {!sales && (
          <Field label={t("supplierRef")} htmlFor="i-ref" optional={tc("optional")} className="sm:col-span-2">
            <Input id="i-ref" value={supplierRef} maxLength={60} onChange={(e) => setSupplierRef(e.target.value)} />
          </Field>
        )}
        {sales && can("sales.dispatch") && (
          <div className="grid gap-2 sm:col-span-2">
            <label className="flex items-center gap-2.5 text-sm font-medium">
              <Switch checked={deliverNow} onCheckedChange={setDeliverNow} />
              {t("deliverNow")}
            </label>
            {deliverNow && (
              <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} aria-label={t("deliverFrom")}>
                {active.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
        )}
      </Card>

      {!sales && !fromOrder && <p className="text-muted-foreground -mt-2 text-sm">{t("directBillHint")}</p>}

      <Card className="overflow-hidden">
        {fromOrder && lines.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">{t("nothingToInvoice")}</p>
        ) : (
          <LinesEditor
            lines={lines}
            onChange={setLines}
            taxRates={taxRates}
            ssclRate={ssclRate}
            price={sales ? "sell" : "cost"}
            warehouseId={sales && deliverNow ? warehouseId : undefined}
            fixed={fromOrder}
          />
        )}
      </Card>

      <Card className="p-5">
        <Field label={t("notes")} htmlFor="i-notes" optional={tc("optional")}>
          <Textarea id="i-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          {tc("cancel")}
        </Button>
        <Button onClick={() => submit()} loading={saving}>
          {!saving && <FileCheck2 />} {t(sales ? "submitInvoice" : "submitBill")}
        </Button>
      </div>
    </div>
  );
}
