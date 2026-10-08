"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CURRENCIES, financeStepSchema, VALUATION_METHODS } from "@stockflow/schemas";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useZodMessage } from "@/hooks/use-zod-message";
import { cn } from "@/lib/utils";
import { STEP_FORM_ID, type StepProps } from "../types";

type Values = z.infer<typeof financeStepSchema>;

const DEFAULTS: Values = {
  currency: "LKR",
  fiscalYearStartMonth: 4,
  vatRegistered: true,
  vatRate: 18,
  ssclEnabled: true,
  ssclRate: 2.5,
  valuationMethod: "weighted_average",
  allowNegativeStock: false,
};

function ToggleRow({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="bg-card flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4">
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
      {children}
    </label>
  );
}

export function FinanceStep({ initial, onSubmit }: StepProps<"finance">) {
  const t = useTranslations("onboarding.finance");
  const locale = useLocale();
  const msg = useZodMessage();
  const form = useForm<Values>({ resolver: zodResolver(financeStepSchema), defaultValues: { ...DEFAULTS, ...initial } });
  const e = form.formState.errors;
  const vat = form.watch("vatRegistered");
  const sscl = form.watch("ssclEnabled");
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2026, i, 1)));

  return (
    <form id={STEP_FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("currency")} htmlFor="currency" error={msg(e.currency?.message)} hint={t("currencyHint")}>
          <NativeSelect id="currency" {...form.register("currency")}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} — {new Intl.DisplayNames([locale], { type: "currency" }).of(c)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("fiscalYear")} htmlFor="fiscalYearStartMonth" hint={t("fiscalYearHint")}>
          <NativeSelect id="fiscalYearStartMonth" {...form.register("fiscalYearStartMonth", { valueAsNumber: true })}>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="grid gap-3">
        <ToggleRow id="vatRegistered" title={t("vat")} description={t("vatHint")}>
          <Controller
            control={form.control}
            name="vatRegistered"
            render={({ field }) => <Switch id="vatRegistered" checked={field.value} onCheckedChange={field.onChange} />}
          />
        </ToggleRow>
        <AnimatePresence initial={false}>
          {vat && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Field label={t("vatRate")} htmlFor="vatRate" error={msg(e.vatRate?.message)} className="max-w-48 pl-4">
                <div className="relative">
                  <Input id="vatRate" type="number" step="0.01" inputMode="decimal" className="pr-8" {...form.register("vatRate", { valueAsNumber: true })} />
                  <span className="text-muted-foreground absolute inset-y-0 right-3 grid place-content-center text-sm">%</span>
                </div>
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
        <ToggleRow id="ssclEnabled" title={t("sscl")} description={t("ssclHint")}>
          <Controller
            control={form.control}
            name="ssclEnabled"
            render={({ field }) => <Switch id="ssclEnabled" checked={field.value} onCheckedChange={field.onChange} />}
          />
        </ToggleRow>
        <AnimatePresence initial={false}>
          {sscl && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Field label={t("ssclRate")} htmlFor="ssclRate" error={msg(e.ssclRate?.message)} className="max-w-48 pl-4">
                <div className="relative">
                  <Input id="ssclRate" type="number" step="0.01" inputMode="decimal" className="pr-8" {...form.register("ssclRate", { valueAsNumber: true })} />
                  <span className="text-muted-foreground absolute inset-y-0 right-3 grid place-content-center text-sm">%</span>
                </div>
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("valuation")}</legend>
        <Controller
          control={form.control}
          name="valuationMethod"
          render={({ field }) => (
            <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
              {VALUATION_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={field.value === m}
                  onClick={() => field.onChange(m)}
                  className={cn(
                    "bg-card focus-visible:ring-ring rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4",
                    field.value === m ? "border-primary ring-primary ring-2" : "hover:border-primary/40",
                  )}
                >
                  <span className="block text-sm font-semibold">{t(`methods.${m}.title`)}</span>
                  <span className="text-muted-foreground mt-1 block text-xs">{t(`methods.${m}.description`)}</span>
                </button>
              ))}
            </div>
          )}
        />
      </fieldset>

      <ToggleRow id="allowNegativeStock" title={t("negativeStock")} description={t("negativeStockHint")}>
        <Controller
          control={form.control}
          name="allowNegativeStock"
          render={({ field }) => <Switch id="allowNegativeStock" checked={field.value} onCheckedChange={field.onChange} />}
        />
      </ToggleRow>
    </form>
  );
}
