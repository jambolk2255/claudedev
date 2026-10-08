"use client";

import { calcLine, sumLines, type LineAmounts } from "@stockflow/schemas";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProductPicker } from "@/components/inventory/product-picker";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { useFormat } from "@/hooks/use-format";
import type { ProductListItem, TaxRate } from "@/lib/types";

export interface EditableLine {
  key: number;
  product: Pick<ProductListItem, "id" | "sku" | "name"> & Partial<ProductListItem>;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxRateId: string;
  description?: string;
  orderLineId?: string;
  /** Upper bound shown next to the quantity (outstanding to invoice/receive). */
  maxQty?: number;
}

let seq = 0;
export const nextKey = () => ++seq;

export function lineAmounts(l: EditableLine, taxRates: TaxRate[], ssclRate: number): LineAmounts {
  const rate = Number(taxRates.find((t) => t.id === l.taxRateId)?.rate ?? 0);
  return calcLine({ quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0, discountPct: Number(l.discountPct) || 0, taxRate: rate }, ssclRate);
}

export function newLineFromProduct(p: ProductListItem, price: "cost" | "sell"): EditableLine {
  return {
    key: nextKey(),
    product: p,
    quantity: "1",
    unitPrice: String(Number(price === "cost" ? p.costPrice : p.sellPrice)),
    discountPct: "0",
    taxRateId: p.taxRateId ?? "",
  };
}

/** Priced lines with product, quantity, price, discount and tax, plus live totals (same maths as the API). */
export function LinesEditor({
  lines,
  onChange,
  taxRates,
  ssclRate,
  price,
  warehouseId,
  fixed,
}: {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  taxRates: TaxRate[];
  ssclRate: number;
  price: "cost" | "sell";
  warehouseId?: string;
  /** Lines come from an order: products can't be changed or added. */
  fixed?: boolean;
}) {
  const t = useTranslations("commerce.lines");
  const f = useFormat();
  const update = (key: number, patch: Partial<EditableLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const amounts = lines.map((l) => lineAmounts(l, taxRates, ssclRate));
  const totals = sumLines(amounts);
  const used = lines.map((l) => l.product.id).filter(Boolean);

  return (
    <div className="grid">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="px-3 py-2 font-medium">{t("product")}</th>
              <th className="w-28 px-3 py-2 font-medium">{t("quantity")}</th>
              <th className="w-32 px-3 py-2 font-medium">{t("price")}</th>
              <th className="w-20 px-3 py-2 font-medium">{t("discount")}</th>
              <th className="w-36 px-3 py-2 font-medium">{t("tax")}</th>
              <th className="w-32 px-3 py-2 text-right font-medium">{t("amount")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="border-b align-top last:border-0">
                <td className="px-3 py-2">
                  {fixed || !l.product.id ? (
                    fixed ? (
                      <div className="pt-1.5">
                        <span className="font-medium">{l.product.name}</span>
                        <span className="text-muted-foreground block font-mono text-xs">{l.product.sku}</span>
                      </div>
                    ) : (
                      <ProductPicker
                        value={null}
                        warehouseId={warehouseId}
                        includeServices
                        exclude={used}
                        onSelect={(p) => onChange(lines.map((x) => (x.key === l.key ? { ...newLineFromProduct(p, price), key: l.key } : x)))}
                      />
                    )
                  ) : (
                    <ProductPicker
                      value={l.product as ProductListItem}
                      warehouseId={warehouseId}
                      includeServices
                      exclude={used.filter((id) => id !== l.product.id)}
                      onSelect={(p) =>
                        onChange(lines.map((x) => (x.key === l.key ? { ...newLineFromProduct(p, price), key: l.key, quantity: x.quantity } : x)))
                      }
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    aria-label={t("quantity")}
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    aria-invalid={(l.maxQty !== undefined && Number(l.quantity) > l.maxQty) || undefined}
                    className="h-8 text-right tabular-nums"
                  />
                  {l.maxQty !== undefined && (
                    <span className="text-muted-foreground mt-1 block text-right text-[11px]">{t("max", { qty: f.qty(l.maxQty) })}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    aria-label={t("price")}
                    value={l.unitPrice}
                    onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                    className="h-8 text-right tabular-nums"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    aria-label={t("discount")}
                    value={l.discountPct}
                    onChange={(e) => update(l.key, { discountPct: e.target.value })}
                    className="h-8 text-right tabular-nums"
                  />
                </td>
                <td className="px-3 py-2">
                  <NativeSelect aria-label={t("tax")} value={l.taxRateId} onChange={(e) => update(l.key, { taxRateId: e.target.value })} className="h-8">
                    <option value="">{t("noTax")}</option>
                    {taxRates.map((tx) => (
                      <option key={tx.id} value={tx.id}>
                        {tx.code} {Number(tx.rate)}%
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{f.money(amounts[i]!.subtotal)}</td>
                <td className="px-2 py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("remove")}
                    onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                    disabled={lines.length === 1}
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-4 border-t p-3 sm:flex-row sm:items-start sm:justify-between">
        {!fixed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              onChange([...lines, { key: nextKey(), product: { id: "", sku: "", name: "" }, quantity: "1", unitPrice: "0", discountPct: "0", taxRateId: "" }])
            }
          >
            <Plus /> {t("add")}
          </Button>
        ) : (
          <span />
        )}
        <Totals totals={totals} />
      </div>
    </div>
  );
}

export function Totals({ totals }: { totals: LineAmounts | { subtotal: unknown; discount?: unknown; sscl: unknown; tax: unknown; total: unknown } }) {
  const t = useTranslations("commerce.lines");
  const f = useFormat();
  const rows = [
    ...(Number(totals.discount ?? 0) > 0 ? [{ label: t("discountTotal"), value: `−${f.money(totals.discount)}` }] : []),
    { label: t("subtotal"), value: f.money(totals.subtotal) },
    ...(Number(totals.sscl) > 0 ? [{ label: t("sscl"), value: f.money(totals.sscl) }] : []),
    { label: t("vat"), value: f.money(totals.tax) },
  ];
  return (
    <dl className="grid w-full max-w-xs gap-1 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-6">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="tabular-nums">{r.value}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-6 border-t pt-2 text-base font-semibold">
        <dt>{t("total")}</dt>
        <dd className="tabular-nums">{f.money(totals.total)}</dd>
      </div>
    </dl>
  );
}
