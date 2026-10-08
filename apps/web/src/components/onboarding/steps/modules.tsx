"use client";

import { INDUSTRY_PRESETS, MODULES, defaultModules, normalizeModules, type ExperienceMode, type ModuleKey } from "@stockflow/schemas";
import {
  Barcode,
  BarChart3,
  ClipboardCheck,
  Hash,
  Landmark,
  Layers,
  Lock,
  MapPinned,
  MonitorSmartphone,
  Package,
  ShoppingCart,
  Sparkles,
  Truck,
  Warehouse,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { STEP_FORM_ID, type StepProps } from "../types";

export const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  inventory: Package,
  purchasing: Truck,
  sales: ShoppingCart,
  orders: ClipboardCheck,
  finance: Landmark,
  reports: BarChart3,
  maps: MapPinned,
  barcodes: Barcode,
  pos: MonitorSmartphone,
  multiWarehouse: Warehouse,
  batches: Layers,
  serials: Hash,
  approvals: ClipboardCheck,
};

export function ModulesStep({ initial, data, onSubmit }: StepProps<"modules">) {
  const t = useTranslations("onboarding.modules");
  const tm = useTranslations("modules");
  const suggested = new Set(data.industry ? INDUSTRY_PRESETS[data.industry.industry].suggestedModules : []);
  const [mode, setMode] = useState<ExperienceMode>(initial?.mode ?? "simple");
  const [enabled, setEnabled] = useState<Set<ModuleKey>>(
    () => new Set(initial?.modules ?? normalizeModules("simple", [...defaultModules("simple"), ...suggested])),
  );

  function toggle(key: ModuleKey, on: boolean) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function changeMode(next: ExperienceMode) {
    setMode(next);
    // Switching to advanced turns on the industry's advanced suggestions.
    if (next === "advanced") setEnabled((prev) => new Set([...prev, ...[...suggested].filter((k) => MODULES.find((m) => m.key === k)?.advancedOnly)]));
  }

  return (
    <form
      id={STEP_FORM_ID}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ mode, modules: normalizeModules(mode, [...enabled]) });
      }}
      className="grid gap-6"
    >
      <div role="radiogroup" aria-label={t("modeLabel")} className="grid gap-3 sm:grid-cols-2">
        {(["simple", "advanced"] as const).map((m) => {
          const Icon = m === "simple" ? Zap : Sparkles;
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => changeMode(m)}
              className={cn(
                "bg-card focus-visible:ring-ring relative flex gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4",
                !active && "hover:border-primary/40",
              )}
            >
              {active && (
                <motion.span
                  layoutId="mode-active"
                  className="ring-primary absolute inset-0 rounded-xl ring-2"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className={cn("grid size-10 shrink-0 place-content-center rounded-xl", active ? "bg-brand text-white" : "bg-muted text-muted-foreground")}>
                <Icon className="size-5" />
              </span>
              <span className="grid gap-0.5">
                <span className="font-semibold">{t(`${m}.title`)}</span>
                <span className="text-muted-foreground text-sm">{t(`${m}.description`)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {MODULES.map((mod, i) => {
          const Icon = MODULE_ICONS[mod.key];
          const locked = mod.advancedOnly && mode === "simple";
          const on = mod.core || (!locked && enabled.has(mod.key));
          return (
            <motion.label
              key={mod.key}
              htmlFor={`module-${mod.key}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: locked ? 0.55 : 1, y: 0 }}
              transition={{ delay: i * 0.025 }}
              className={cn(
                "bg-card flex items-center gap-3 rounded-xl border p-3 transition-colors",
                on && "border-primary/40 bg-primary/[0.03]",
                !locked && !mod.core && "cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-content-center rounded-lg transition-colors",
                  on ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="grid flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {tm(`${mod.key}.name`)}
                  {mod.core && <Badge variant="secondary">{t("core")}</Badge>}
                  {suggested.has(mod.key) && !mod.core && <Badge variant="success">{t("recommended")}</Badge>}
                  {locked && (
                    <Badge variant="outline">
                      <Lock /> {t("advancedOnly")}
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">{tm(`${mod.key}.description`)}</span>
              </span>
              <Switch
                id={`module-${mod.key}`}
                checked={on}
                disabled={mod.core || locked}
                onCheckedChange={(v) => toggle(mod.key, v)}
                aria-label={tm(`${mod.key}.name`)}
              />
            </motion.label>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">{t("changeLater")}</p>
    </form>
  );
}
