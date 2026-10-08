"use client";

import { ADJUSTMENT_REASONS, STOCK_DOCUMENT_PERMISSIONS, STOCK_OUT_REASONS, type Paginated, type StockDocumentType } from "@stockflow/schemas";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ClipboardList,
  Info,
  Plus,
  ScanLine,
  SlidersHorizontal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useCan, useMe } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { useRouter } from "@/i18n/navigation";
import { ApiError, api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Partner, ProductDetail, ProductListItem, StockDocumentDetail, Warehouse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScanButton } from "./barcode-scanner";
import { ProductPicker } from "./product-picker";

export const DOC_ICONS: Record<StockDocumentType, LucideIcon> = {
  stock_in: ArrowDownToLine,
  stock_out: ArrowUpFromLine,
  adjustment: SlidersHorizontal,
  count: ClipboardList,
  transfer: ArrowLeftRight,
};

interface Line {
  key: number;
  product: ProductListItem | null;
  quantity: string;
  unitCost: string;
  batchNo: string;
  expiryDate: string;
  direction: "in" | "out";
}

let lineKey = 0;
const newLine = (product: ProductListItem | null = null): Line => ({
  key: ++lineKey,
  product,
  quantity: "",
  unitCost: product ? String(Number(product.costPrice)) : "",
  batchNo: "",
  expiryDate: "",
  direction: "out",
});

const today = () => new Date().toISOString().slice(0, 10);

export function StockDocumentForm({ initialType, initialProductId }: { initialType?: StockDocumentType; initialProductId?: string }) {
  const t = useTranslations("inventory.form");
  const td = useTranslations("inventory.docTypes");
  const tr = useTranslations("inventory.reasons");
  const f = useFormat();
  const can = useCan();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();

  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });
  const active = (warehouses.data ?? []).filter((w) => w.active);
  const multi = me?.organization.modules.includes("multiWarehouse") && active.length > 1;
  const types = (Object.keys(DOC_ICONS) as StockDocumentType[]).filter((ty) => can(STOCK_DOCUMENT_PERMISSIONS[ty]) && (ty !== "transfer" || multi));

  const [type, setType] = useState<StockDocumentType>(initialType ?? "stock_in");
  const [warehouseId, setWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [reason, setReason] = useState<string>("");
  const [documentDate, setDocumentDate] = useState(today());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [scan, setScan] = useState("");
  const [saving, setSaving] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  // Fall back to an allowed type only once permissions and warehouses are known.
  const ready = !!me && warehouses.isSuccess;
  useEffect(() => {
    if (ready && types.length && !types.includes(type)) setType(types[0]!);
  }, [ready, types, type]);
  useEffect(() => {
    if (!warehouseId && active.length) setWarehouseId((active.find((w) => w.isDefault) ?? active[0])!.id);
    if (!toWarehouseId && active.length > 1) setToWarehouseId(active.find((w) => !w.isDefault)?.id ?? "");
  }, [active, warehouseId, toWarehouseId]);
  useEffect(() => {
    setPartnerId("");
    setReason(type === "stock_out" ? "sale" : type === "adjustment" ? "damaged" : "");
  }, [type]);

  // Preselect a product when coming from a product page.
  useEffect(() => {
    if (!initialProductId) return;
    void api<ProductDetail>(`/products/${initialProductId}`)
      .then((p) => setLines((ls) => (ls.length === 1 && !ls[0]!.product ? [{ ...newLine(p), key: ls[0]!.key }] : [...ls, newLine(p)])))
      .catch(() => undefined);
  }, [initialProductId]);

  const partnerType = type === "stock_in" ? "supplier" : type === "stock_out" ? "customer" : null;
  const partners = useQuery({
    queryKey: ["partners", partnerType, "all"],
    queryFn: () => api<Paginated<Partner>>(`/partners?type=${partnerType}&pageSize=100`),
    enabled: !!partnerType && can(partnerType === "supplier" ? "purchasing.view" : "sales.view"),
  });

  // Live stock per line in the selected warehouse (and batches for batch-tracked items).
  const details = useQueries({
    queries: lines.map((l) => ({
      queryKey: ["product", l.product?.id],
      queryFn: () => api<ProductDetail>(`/products/${l.product!.id}`),
      enabled: !!l.product,
      staleTime: 10_000,
    })),
  });
  const onHand = (i: number) => {
    const d = details[i]?.data;
    if (!d) return null;
    return Number(d.levels.find((lv) => lv.warehouse.id === warehouseId)?.quantity ?? 0);
  };
  const batchesIn = (i: number) =>
    (details[i]?.data?.batches ?? [])
      .map((b) => ({ ...b, qty: Number(b.balances.find((bb) => bb.warehouse.id === warehouseId)?.quantity ?? 0) }))
      .filter((b) => b.qty > 0);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const usedIds = lines.map((l) => l.product?.id).filter(Boolean) as string[];

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    await addByCode(scan.trim());
  }

  async function addByCode(code: string) {
    if (!code) return;
    try {
      const p = await api<ProductListItem>(`/products/lookup?code=${encodeURIComponent(code)}`);
      setLines((ls) => {
        const existing = ls.find((l) => l.product?.id === p.id && !p.trackBatches);
        if (existing) return ls.map((l) => (l === existing ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l));
        const blank = ls.find((l) => !l.product);
        const line = { ...newLine(p), quantity: "1" };
        return blank ? ls.map((l) => (l === blank ? { ...line, key: l.key } : l)) : [...ls, line];
      });
      setScan("");
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 404 ? t("scanNotFound", { code }) : t("scanFailed"));
    }
    scanRef.current?.focus();
  }

  const filled = lines.filter((l) => l.product);
  const lineQty = (l: Line) => {
    const q = Number(l.quantity) || 0;
    return type === "adjustment" && l.direction === "out" ? -q : q;
  };
  const totalValue = useMemo(
    () => (type === "stock_in" || type === "adjustment" ? filled.reduce((s, l) => s + Math.abs(lineQty(l)) * (Number(l.unitCost) || 0), 0) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filled, type],
  );

  function validate(): string | null {
    if (!warehouseId) return t("errors.warehouse");
    if (type === "transfer" && (!toWarehouseId || toWarehouseId === warehouseId)) return t("errors.toWarehouse");
    if (filled.length === 0) return t("errors.noLines");
    for (const l of filled) {
      const q = Number(l.quantity);
      if (l.quantity === "" || Number.isNaN(q) || (type === "count" ? q < 0 : q <= 0)) return t("errors.quantity", { sku: l.product!.sku });
      const receives = type === "stock_in" || (type === "adjustment" && l.direction === "in") || type === "count";
      if (l.product!.trackBatches && receives && !l.batchNo.trim()) return t("errors.batch", { sku: l.product!.sku });
    }
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) return toast.error(problem);
    const payloadLines = filled.map((l) => {
      const base = { productId: l.product!.id, batchNo: l.batchNo.trim() || null, quantity: lineQty(l) };
      if (type === "stock_in" || (type === "adjustment" && l.direction === "in"))
        return { ...base, unitCost: l.unitCost === "" ? undefined : Number(l.unitCost), expiryDate: l.expiryDate || null };
      return base;
    });
    const body = {
      type,
      warehouseId,
      documentDate,
      reference: reference || null,
      note: note || null,
      lines: payloadLines,
      ...(type === "transfer" ? { toWarehouseId } : {}),
      ...(partnerType ? { partnerId: partnerId || null } : {}),
      ...(type === "stock_out" || type === "adjustment" ? { reason } : {}),
    };
    setSaving(true);
    try {
      const doc = await api<StockDocumentDetail>("/stock/documents", { method: "POST", body });
      toast.success(t("posted", { number: doc.number }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products"] }),
        qc.invalidateQueries({ queryKey: ["product"] }),
        qc.invalidateQueries({ queryKey: ["stock"] }),
      ]);
      router.push(`/inventory/documents/${doc.id}`);
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  const showCost = type === "stock_in" || type === "adjustment";
  const Icon = DOC_ICONS[type];

  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label={t("typeLabel")} className="bg-muted inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg p-1">
        {types.map((ty) => {
          const TIcon = DOC_ICONS[ty];
          const on = ty === type;
          return (
            <button
              key={ty}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setType(ty)}
              className={cn(
                "relative flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm transition-colors",
                on ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {on && (
                <motion.span
                  layoutId="doc-type"
                  className="bg-card shadow-card absolute inset-0 rounded-md"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <TIcon className={cn("relative size-4", on && "text-primary")} />
              <span className="relative">{td(ty)}</span>
            </button>
          );
        })}
      </div>

      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={type === "transfer" ? t("fromWarehouse") : t("warehouse")} htmlFor="doc-wh">
          <NativeSelect id="doc-wh" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </NativeSelect>
        </Field>
        {type === "transfer" && (
          <Field label={t("toWarehouse")} htmlFor="doc-to">
            <NativeSelect id="doc-to" value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
              <option value="">—</option>
              {active
                .filter((w) => w.id !== warehouseId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
            </NativeSelect>
          </Field>
        )}
        {partnerType && (
          <Field label={t(partnerType)} htmlFor="doc-partner" optional={t("optional")}>
            <NativeSelect id="doc-partner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">—</option>
              {partners.data?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        {(type === "stock_out" || type === "adjustment") && (
          <Field label={t("reason")} htmlFor="doc-reason">
            <NativeSelect id="doc-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {(type === "stock_out" ? STOCK_OUT_REASONS : ADJUSTMENT_REASONS).map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field label={t("date")} htmlFor="doc-date">
          <Input id="doc-date" type="date" value={documentDate} max={today()} onChange={(e) => setDocumentDate(e.target.value)} />
        </Field>
        <Field label={t("reference")} htmlFor="doc-ref" optional={t("optional")}>
          <Input id="doc-ref" value={reference} maxLength={100} placeholder={t("referencePlaceholder")} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="text-primary size-4" /> {t("items")}
            <span className="text-muted-foreground font-normal tabular-nums">({filled.length})</span>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <form onSubmit={onScan} className="relative flex-1 sm:w-72">
              <ScanLine className="text-muted-foreground pointer-events-none absolute left-2.5 top-2.5 size-4" />
              <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder={t("scan")} aria-label={t("scan")} className="h-9 pl-8" />
            </form>
            <ScanButton onDetect={(code) => void addByCode(code)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="w-8 px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">{t("product")}</th>
                <th className="w-28 px-3 py-2 text-right font-medium">{type === "count" ? t("system") : t("onHand")}</th>
                <th className="w-40 px-3 py-2 font-medium">{t("batch")}</th>
                {type === "adjustment" && <th className="w-28 px-3 py-2 font-medium">{t("direction")}</th>}
                <th className="w-28 px-3 py-2 font-medium">{type === "count" ? t("counted") : t("quantity")}</th>
                {showCost && <th className="w-32 px-3 py-2 font-medium">{t("unitCost")}</th>}
                <th className="w-32 px-3 py-2 text-right font-medium">{type === "count" ? t("variance") : showCost ? t("lineValue") : t("after")}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {lines.map((l, i) => {
                  const stock = onHand(i);
                  const qty = Number(l.quantity) || 0;
                  const receives = type === "stock_in" || (type === "adjustment" && l.direction === "in");
                  const batches = batchesIn(i);
                  const systemQty = type === "count" && l.product?.trackBatches ? (batches.find((b) => b.batchNo === l.batchNo)?.qty ?? 0) : stock;
                  const after =
                    stock === null ? null : type === "stock_in" ? stock + qty : type === "count" ? qty : stock + (type === "adjustment" ? lineQty(l) : -qty);
                  const short = !receives && type !== "count" && stock !== null && qty > stock;
                  return (
                    <motion.tr
                      key={l.key}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b align-top last:border-0"
                    >
                      <td className="text-muted-foreground px-3 py-2.5 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2">
                        <ProductPicker
                          value={l.product}
                          warehouseId={warehouseId}
                          exclude={usedIds.filter((id) => id !== l.product?.id)}
                          onSelect={(p) => update(l.key, { product: p, unitCost: String(Number(p.costPrice)), batchNo: "", expiryDate: "" })}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {l.product ? (systemQty === null ? "…" : `${f.qty(systemQty)} ${l.product.unit?.code ?? ""}`) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {!l.product?.trackBatches ? (
                          <span className="text-muted-foreground text-xs">{l.product ? t("noBatch") : ""}</span>
                        ) : receives || type === "count" ? (
                          <div className="grid gap-1">
                            <Input
                              value={l.batchNo}
                              onChange={(e) => update(l.key, { batchNo: e.target.value })}
                              placeholder={t("batchNo")}
                              list={`batches-${l.key}`}
                              className="h-8"
                            />
                            <datalist id={`batches-${l.key}`}>
                              {batches.map((b) => (
                                <option key={b.id} value={b.batchNo} />
                              ))}
                            </datalist>
                            {receives && (
                              <Input
                                type="date"
                                value={l.expiryDate}
                                onChange={(e) => update(l.key, { expiryDate: e.target.value })}
                                aria-label={t("expiry")}
                                className="h-8"
                              />
                            )}
                          </div>
                        ) : (
                          <NativeSelect value={l.batchNo} onChange={(e) => update(l.key, { batchNo: e.target.value })} className="h-8" aria-label={t("batch")}>
                            <option value="">{t("fefo")}</option>
                            {batches.map((b) => (
                              <option key={b.id} value={b.batchNo}>
                                {b.batchNo} · {f.qty(b.qty)}
                                {b.expiryDate ? ` · ${f.date(b.expiryDate)}` : ""}
                              </option>
                            ))}
                          </NativeSelect>
                        )}
                      </td>
                      {type === "adjustment" && (
                        <td className="px-3 py-2">
                          <NativeSelect
                            value={l.direction}
                            onChange={(e) => update(l.key, { direction: e.target.value as Line["direction"] })}
                            className="h-8"
                            aria-label={t("direction")}
                          >
                            <option value="out">{t("remove")}</option>
                            <option value="in">{t("add")}</option>
                          </NativeSelect>
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={l.quantity}
                          onChange={(e) => update(l.key, { quantity: e.target.value })}
                          aria-label={t("quantity")}
                          aria-invalid={short || undefined}
                          className="h-8 text-right tabular-nums"
                        />
                      </td>
                      {showCost && (
                        <td className="px-3 py-2">
                          {receives ? (
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              value={l.unitCost}
                              onChange={(e) => update(l.key, { unitCost: e.target.value })}
                              aria-label={t("unitCost")}
                              className="h-8 text-right tabular-nums"
                            />
                          ) : (
                            <span className="text-muted-foreground block pt-1.5 text-right text-xs">{t("atCost")}</span>
                          )}
                        </td>
                      )}
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", short && "text-destructive font-medium")}>
                        {type === "count"
                          ? l.product && l.quantity !== "" && systemQty !== null
                            ? `${qty - systemQty > 0 ? "+" : ""}${f.qty(qty - systemQty)}`
                            : "—"
                          : showCost && receives
                            ? f.money(qty * (Number(l.unitCost) || 0))
                            : after === null || !l.product
                              ? "—"
                              : f.qty(after)}
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("removeLine")}
                          onClick={() => setLines((ls) => (ls.length === 1 ? [newLine()] : ls.filter((x) => x.key !== l.key)))}
                        >
                          <Trash2 className="text-muted-foreground" />
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
            <Plus /> {t("addLine")}
          </Button>
          {totalValue !== null && (
            <div className="text-sm">
              <span className="text-muted-foreground">{t("total")}:</span> <span className="font-semibold tabular-nums">{f.money(totalValue)}</span>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <Field label={t("note")} htmlFor="doc-note" optional={t("optional")}>
          <Textarea id="doc-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Card>

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Info className="size-3.5" /> {t("finalNote")}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={submit} loading={saving} disabled={filled.length === 0}>
            {!saving && <Icon />} {t("post", { type: td(type) })}
          </Button>
        </div>
      </div>
    </div>
  );
}
