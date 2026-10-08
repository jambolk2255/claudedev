"use client";

import { INDUSTRIES, INDUSTRY_PRESETS, type Industry } from "@stockflow/schemas";
import { Boxes, Factory, Hammer, Pill, Shirt, ShoppingBasket, Smartphone, Store, Truck, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STEP_FORM_ID, type StepProps } from "../types";

export const INDUSTRY_ICONS: Record<Industry, LucideIcon> = {
  retail: Store,
  wholesale: Truck,
  pharmacy: Pill,
  hardware: Hammer,
  fmcg: ShoppingBasket,
  food: UtensilsCrossed,
  manufacturing: Factory,
  electronics: Smartphone,
  apparel: Shirt,
  other: Boxes,
};

export function IndustryStep({ initial, onSubmit }: StepProps<"industry">) {
  const t = useTranslations("onboarding.industry");
  const [selected, setSelected] = useState<Industry | undefined>(initial?.industry);
  const [error, setError] = useState(false);
  const preset = selected ? INDUSTRY_PRESETS[selected] : null;

  return (
    <form
      id={STEP_FORM_ID}
      onSubmit={(e) => {
        e.preventDefault();
        if (!selected) return setError(true);
        void onSubmit({ industry: selected });
      }}
      className="grid gap-5"
    >
      <div role="radiogroup" aria-label={t("title")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {INDUSTRIES.map((key, i) => {
          const Icon = INDUSTRY_ICONS[key];
          const active = selected === key;
          return (
            <motion.button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => (setSelected(key), setError(false))}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "bg-card focus-visible:ring-ring relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4",
                active ? "border-primary text-primary" : "hover:border-primary/40",
              )}
            >
              {active && (
                <motion.span
                  layoutId="industry-active"
                  className="bg-primary/8 ring-primary absolute inset-0 rounded-xl ring-2"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span
                className={cn(
                  "relative grid size-10 place-content-center rounded-xl transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="relative leading-tight">{t(`options.${key}`)}</span>
            </motion.button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t("required")}
        </p>
      )}
      <AnimatePresence mode="wait">
        {preset && selected && (
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-muted/40 grid gap-3 rounded-xl border p-4 text-sm"
          >
            <p className="font-medium">{t("presetTitle")}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground mr-1">{t("categories")}:</span>
              {preset.categories.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground mr-1">{t("units")}:</span>
              {preset.units.map((u) => (
                <Badge key={u} variant="outline">
                  {u}
                </Badge>
              ))}
            </div>
            {preset.expiryAlertDays && <p className="text-muted-foreground">{t("expiry", { days: preset.expiryAlertDays })}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
