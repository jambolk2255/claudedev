"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { productInputSchema } from "@stockflow/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useMe } from "@/hooks/use-auth";
import { useZodMessage } from "@/hooks/use-zod-message";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Category, ProductListItem, TaxRate, Unit } from "@/lib/types";

type Values = z.input<typeof productInputSchema>;
const FORM_ID = "product-form";

const numOrNull = (v: unknown) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? null : Number(v));

function toValues(p?: ProductListItem | null): Values {
  return {
    sku: p?.sku ?? "",
    name: p?.name ?? "",
    description: p?.description ?? "",
    barcode: p?.barcode ?? "",
    type: p?.type ?? "stock",
    categoryId: p?.categoryId ?? "",
    unitId: p?.unitId ?? "",
    taxRateId: p?.taxRateId ?? "",
    costPrice: p ? Number(p.costPrice) : 0,
    sellPrice: p ? Number(p.sellPrice) : 0,
    reorderLevel: p?.reorderLevel != null ? Number(p.reorderLevel) : null,
    maxLevel: p?.maxLevel != null ? Number(p.maxLevel) : null,
    trackBatches: p?.trackBatches ?? false,
    active: p?.active ?? true,
  };
}

export function ProductFormSheet({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: ProductListItem | null;
  onSaved?: (p: ProductListItem) => void;
}) {
  const t = useTranslations("inventory.productForm");
  const tc = useTranslations("common");
  const msg = useZodMessage();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const batchesOn = me?.organization.modules.includes("batches");
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories"), enabled: open });
  const units = useQuery({ queryKey: ["units"], queryFn: () => api<Unit[]>("/units"), enabled: open });
  const taxes = useQuery({ queryKey: ["tax-rates"], queryFn: () => api<TaxRate[]>("/tax-rates"), enabled: open });

  const form = useForm<Values>({ resolver: zodResolver(productInputSchema), defaultValues: toValues(product) });
  useEffect(() => {
    if (open) form.reset(toValues(product));
  }, [open, product, form]);
  const e = form.formState.errors;
  const isService = form.watch("type") === "service";

  async function onSubmit(values: Values) {
    const body = productInputSchema.parse(values);
    try {
      const saved = await api<ProductListItem>(product ? `/products/${product.id}` : "/products", { method: product ? "PUT" : "POST", body });
      toast.success(product ? t("updated") : t("created", { sku: saved.sku }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products"] }),
        qc.invalidateQueries({ queryKey: ["product", product?.id] }),
        qc.invalidateQueries({ queryKey: ["stock"] }),
      ]);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      handleFormError(err, form.setError);
    }
  }

  const numberField = (name: "costPrice" | "sellPrice" | "reorderLevel" | "maxLevel", nullable = false) =>
    form.register(name, { setValueAs: (v) => (nullable ? numOrNull(v) : v === "" ? 0 : Number(v)) });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={product ? t("editTitle") : t("newTitle")}
        description={product ? `${product.sku} · ${product.name}` : t("newSubtitle")}
        closeLabel={tc("close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" form={FORM_ID} loading={form.formState.isSubmitting}>
              {product ? tc("save") : t("create")}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5" noValidate>
          <section className="grid gap-4">
            <Field label={t("name")} htmlFor="p-name" error={msg(e.name?.message)}>
              <Input id="p-name" autoFocus aria-invalid={!!e.name} {...form.register("name")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sku")} htmlFor="p-sku" error={e.sku ? t("skuInvalid") : undefined} hint={!product ? t("skuHint") : undefined}>
                <Input id="p-sku" className="font-mono uppercase" {...form.register("sku")} />
              </Field>
              <Field label={t("barcode")} htmlFor="p-barcode" optional={tc("optional")}>
                <Input id="p-barcode" className="font-mono" {...form.register("barcode")} />
              </Field>
              <Field label={t("category")} htmlFor="p-cat">
                <NativeSelect id="p-cat" {...form.register("categoryId")}>
                  <option value="">—</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("unit")} htmlFor="p-unit">
                <NativeSelect id="p-unit" {...form.register("unitId")}>
                  <option value="">—</option>
                  {units.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </section>

          <section className="grid gap-4 border-t pt-5">
            <h3 className="text-sm font-semibold">{t("pricing")}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("cost")} htmlFor="p-cost" error={msg(e.costPrice?.message)}>
                <Input id="p-cost" type="number" step="any" min={0} inputMode="decimal" className="text-right" {...numberField("costPrice")} />
              </Field>
              <Field label={t("price")} htmlFor="p-price" error={msg(e.sellPrice?.message)}>
                <Input id="p-price" type="number" step="any" min={0} inputMode="decimal" className="text-right" {...numberField("sellPrice")} />
              </Field>
              <Field label={t("tax")} htmlFor="p-tax">
                <NativeSelect id="p-tax" {...form.register("taxRateId")}>
                  <option value="">—</option>
                  {taxes.data?.map((tx) => (
                    <option key={tx.id} value={tx.id}>
                      {tx.code} ({Number(tx.rate)}%)
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </section>

          {!isService && (
            <section className="grid gap-4 border-t pt-5">
              <h3 className="text-sm font-semibold">{t("stockControl")}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("reorder")} htmlFor="p-reorder" hint={t("reorderHint")} error={msg(e.reorderLevel?.message)}>
                  <Input id="p-reorder" type="number" step="any" min={0} inputMode="decimal" className="text-right" {...numberField("reorderLevel", true)} />
                </Field>
                <Field label={t("max")} htmlFor="p-max" hint={t("maxHint")} error={e.maxLevel ? t("maxInvalid") : undefined}>
                  <Input id="p-max" type="number" step="any" min={0} inputMode="decimal" className="text-right" {...numberField("maxLevel", true)} />
                </Field>
              </div>
              {batchesOn && (
                <label htmlFor="p-batches" className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{t("trackBatches")}</span>
                    <span className="text-muted-foreground text-xs">{t("trackBatchesHint")}</span>
                  </span>
                  <Controller
                    control={form.control}
                    name="trackBatches"
                    render={({ field }) => <Switch id="p-batches" checked={!!field.value} onCheckedChange={field.onChange} />}
                  />
                </label>
              )}
            </section>
          )}

          <section className="grid gap-4 border-t pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("type")} htmlFor="p-type">
                <NativeSelect id="p-type" {...form.register("type")}>
                  <option value="stock">{t("types.stock")}</option>
                  <option value="service">{t("types.service")}</option>
                </NativeSelect>
              </Field>
              <label htmlFor="p-active" className="flex items-center justify-between gap-4 self-end rounded-md border p-2.5">
                <span className="text-sm font-medium">{t("active")}</span>
                <Controller
                  control={form.control}
                  name="active"
                  render={({ field }) => <Switch id="p-active" checked={!!field.value} onCheckedChange={field.onChange} />}
                />
              </label>
            </div>
            <Field label={t("description")} htmlFor="p-desc" optional={tc("optional")}>
              <Textarea id="p-desc" rows={3} {...form.register("description")} />
            </Field>
          </section>
        </form>
      </SheetContent>
    </Sheet>
  );
}
