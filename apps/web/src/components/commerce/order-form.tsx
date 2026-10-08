"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useCan } from "@/hooks/use-auth";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { OrderDetail, OrderKind, Partner, Warehouse } from "@/lib/types";
import { LinesEditor, nextKey, type EditableLine } from "./lines-editor";
import { PartnerPicker } from "./partner-picker";
import { orderPath } from "./paths";
import { useTaxes } from "./use-taxes";

const today = () => new Date().toISOString().slice(0, 10);

/** Create or edit (draft) purchase orders, quotations and sales orders. */
export function OrderForm({ kind, existing }: { kind: OrderKind; existing?: OrderDetail }) {
  const t = useTranslations("commerce.orderForm");
  const tc = useTranslations("common");
  const can = useCan();
  const router = useRouter();
  const qc = useQueryClient();
  const sales = kind !== "purchase";
  const { taxRates, ssclRate } = useTaxes(sales ? "sales" : "purchase");
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });
  const active = (warehouses.data ?? []).filter((w) => w.active);

  const [partner, setPartner] = useState<Partner | null>(existing ? (existing.partner as unknown as Partner) : null);
  const [warehouseId, setWarehouseId] = useState(existing?.warehouseId ?? "");
  const [orderDate, setOrderDate] = useState(existing?.orderDate.slice(0, 10) ?? today());
  const [expectedDate, setExpectedDate] = useState(existing?.expectedDate?.slice(0, 10) ?? "");
  const [reference, setReference] = useState(existing?.reference ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(existing?.deliveryAddress ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [lines, setLines] = useState<EditableLine[]>(
    existing
      ? existing.lines.map((l) => ({
          key: nextKey(),
          product: { ...l.product, unit: l.product.unit ?? null } as EditableLine["product"],
          quantity: String(Number(l.quantity)),
          unitPrice: String(Number(l.unitPrice)),
          discountPct: String(Number(l.discountPct)),
          taxRateId: l.taxRateId ?? "",
        }))
      : [{ key: nextKey(), product: { id: "", sku: "", name: "" }, quantity: "1", unitPrice: "0", discountPct: "0", taxRateId: "" }],
  );
  const [saving, setSaving] = useState<null | "save" | "confirm">(null);
  const [partnerError, setPartnerError] = useState(false);

  useEffect(() => {
    if (!warehouseId && active.length) setWarehouseId((active.find((w) => w.isDefault) ?? active[0])!.id);
  }, [active, warehouseId]);
  useEffect(() => {
    if (sales && partner?.address && !deliveryAddress && !existing) setDeliveryAddress([partner.address, partner.city].filter(Boolean).join(", "));
  }, [partner, sales, deliveryAddress, existing]);

  async function submit(confirm: boolean) {
    const filled = lines.filter((l) => l.product.id);
    if (!partner) return setPartnerError(true);
    if (filled.length === 0) return toast.error(t("noLines"));
    if (filled.some((l) => !(Number(l.quantity) > 0))) return toast.error(t("badQuantity"));
    const body = {
      kind,
      partnerId: partner.id,
      warehouseId,
      orderDate,
      expectedDate: expectedDate || null,
      reference: reference || null,
      notes: notes || null,
      deliveryAddress: sales ? deliveryAddress || null : null,
      lines: filled.map((l) => ({
        productId: l.product.id,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice) || 0,
        discountPct: Number(l.discountPct) || 0,
        taxRateId: l.taxRateId || null,
      })),
    };
    setSaving(confirm ? "confirm" : "save");
    try {
      const order = await api<OrderDetail>(existing ? `/orders/${existing.id}` : "/orders", { method: existing ? "PUT" : "POST", body });
      if (confirm) await api(`/orders/${order.id}/confirm`, { method: "POST", body: {} });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success(confirm ? t("confirmed", { number: order.number }) : t("saved", { number: order.number }));
      router.push(orderPath(kind, order.id));
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(null);
    }
  }

  const canConfirm = can(kind === "purchase" ? "purchasing.approve" : "sales.approve") || can(kind === "purchase" ? "purchasing.manage" : "sales.manage");

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label={t(kind === "purchase" ? "supplier" : "customer")}
          htmlFor="o-partner"
          error={partnerError ? t("partnerRequired") : undefined}
          className="sm:col-span-2"
        >
          <PartnerPicker
            id="o-partner"
            type={kind === "purchase" ? "supplier" : "customer"}
            value={partner}
            invalid={partnerError}
            onSelect={(p) => (setPartner(p), setPartnerError(false))}
          />
        </Field>
        <Field label={t(kind === "purchase" ? "receiveInto" : "shipFrom")} htmlFor="o-wh">
          <NativeSelect id="o-wh" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("reference")} htmlFor="o-ref" optional={tc("optional")}>
          <Input id="o-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label={t(kind === "quotation" ? "quoteDate" : "orderDate")} htmlFor="o-date">
          <Input id="o-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
        <Field
          label={t(kind === "purchase" ? "expectedDelivery" : kind === "quotation" ? "validUntil" : "deliveryDate")}
          htmlFor="o-expected"
          optional={tc("optional")}
        >
          <Input id="o-expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </Field>
        {sales && (
          <Field label={t("deliveryAddress")} htmlFor="o-address" optional={tc("optional")} className="sm:col-span-2">
            <Input id="o-address" value={deliveryAddress} maxLength={300} onChange={(e) => setDeliveryAddress(e.target.value)} />
          </Field>
        )}
      </Card>

      <Card className="overflow-hidden">
        <LinesEditor
          lines={lines}
          onChange={setLines}
          taxRates={taxRates}
          ssclRate={ssclRate}
          price={kind === "purchase" ? "cost" : "sell"}
          warehouseId={warehouseId}
        />
      </Card>

      <Card className="p-5">
        <Field label={t("notes")} htmlFor="o-notes" optional={tc("optional")}>
          <Textarea id="o-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          {tc("cancel")}
        </Button>
        <Button variant="outline" onClick={() => submit(false)} loading={saving === "save"} disabled={!!saving}>
          {saving !== "save" && <Save />} {t("saveDraft")}
        </Button>
        {canConfirm && (
          <Button onClick={() => submit(true)} loading={saving === "confirm"} disabled={!!saving}>
            {saving !== "confirm" && <Check />} {t(kind === "quotation" ? "saveAndSend" : "saveAndConfirm")}
          </Button>
        )}
      </div>
    </div>
  );
}
