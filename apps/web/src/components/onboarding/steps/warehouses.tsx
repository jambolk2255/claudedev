"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { warehousesStepSchema } from "@stockflow/schemas";
import { Plus, Star, Trash2, Warehouse } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";
import { LocationPicker } from "@/components/maps/location-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useZodMessage } from "@/hooks/use-zod-message";
import { cn } from "@/lib/utils";
import { STEP_FORM_ID, type StepProps } from "../types";

type Values = z.input<typeof warehousesStepSchema>;

export function WarehousesStep({ initial, data, onSubmit }: StepProps<"warehouses">) {
  const t = useTranslations("onboarding.warehouses");
  const tc = useTranslations("common");
  const msg = useZodMessage();
  const multi = data.modules?.modules.includes("multiWarehouse") ?? false;
  const form = useForm<Values>({
    resolver: zodResolver(warehousesStepSchema),
    defaultValues: initial ?? {
      warehouses: [{ name: t("defaultName"), code: "MAIN", address: data.company?.address ?? "", latitude: null, longitude: null, isDefault: true }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "warehouses" });
  const e = form.formState.errors;
  const rows = form.watch("warehouses");

  function setDefault(index: number) {
    rows.forEach((_, i) => form.setValue(`warehouses.${i}.isDefault`, i === index, { shouldDirty: true }));
  }

  return (
    <form id={STEP_FORM_ID} onSubmit={form.handleSubmit((v) => onSubmit(warehousesStepSchema.parse(v)))} className="grid gap-4" noValidate>
      <AnimatePresence initial={false}>
        {fields.map((f, i) => (
          <motion.div
            key={f.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -30, transition: { duration: 0.2 } }}
            className={cn("bg-card grid gap-4 rounded-xl border p-4", rows[i]?.isDefault && "border-primary/40")}
          >
            <div className="flex items-center gap-2">
              <span className="bg-primary/10 text-primary grid size-9 place-content-center rounded-lg">
                <Warehouse className="size-4" />
              </span>
              <span className="flex-1 font-medium">{rows[i]?.name || t("untitled")}</span>
              <Button
                type="button"
                variant={rows[i]?.isDefault ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDefault(i)}
                aria-pressed={!!rows[i]?.isDefault}
              >
                <Star className={cn(rows[i]?.isDefault && "fill-warning text-warning")} /> {rows[i]?.isDefault ? t("isDefault") : t("makeDefault")}
              </Button>
              {fields.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={tc("remove")}>
                  <Trash2 className="text-destructive" />
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <Field label={t("name")} htmlFor={`w-${i}-name`} error={msg(e.warehouses?.[i]?.name?.message)}>
                <Input id={`w-${i}-name`} aria-invalid={!!e.warehouses?.[i]?.name} {...form.register(`warehouses.${i}.name`)} />
              </Field>
              <Field label={t("code")} htmlFor={`w-${i}-code`} error={e.warehouses?.[i]?.code ? t("codeInvalid") : undefined}>
                <Input
                  id={`w-${i}-code`}
                  className="font-mono uppercase"
                  maxLength={12}
                  aria-invalid={!!e.warehouses?.[i]?.code}
                  {...form.register(`warehouses.${i}.code`)}
                />
              </Field>
            </div>
            <Field label={t("address")} htmlFor={`w-${i}-address`} optional={tc("optional")}>
              <Input id={`w-${i}-address`} {...form.register(`warehouses.${i}.address`)} />
            </Field>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t("location")}</span>
              <LocationPicker
                idPrefix={`w-${i}`}
                value={rows[i]?.latitude != null && rows[i]?.longitude != null ? { lat: rows[i]!.latitude!, lng: rows[i]!.longitude! } : null}
                onChange={(v) => {
                  form.setValue(`warehouses.${i}.latitude`, v?.lat ?? null, { shouldDirty: true });
                  form.setValue(`warehouses.${i}.longitude`, v?.lng ?? null, { shouldDirty: true });
                }}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {e.warehouses?.root?.message || e.warehouses?.message ? (
        <p role="alert" className="text-destructive text-sm">
          {t("duplicateCode")}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="border-dashed"
        onClick={() => append({ name: "", code: `WH${fields.length + 1}`, address: "", latitude: null, longitude: null, isDefault: false })}
      >
        <Plus /> {t("add")}
      </Button>
      {!multi && fields.length > 1 && <p className="text-muted-foreground text-xs">{t("multiHint")}</p>}
    </form>
  );
}
