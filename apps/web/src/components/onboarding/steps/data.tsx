"use client";

import { FileSpreadsheet, FlaskConical, Rocket, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STEP_FORM_ID, type StepProps } from "../types";

const OPTIONS: { key: "empty" | "demo" | "import"; icon: LucideIcon; disabled?: boolean }[] = [
  { key: "empty", icon: Rocket },
  { key: "demo", icon: FlaskConical },
  { key: "import", icon: FileSpreadsheet, disabled: true },
];

export function DataStep({ initial, onSubmit }: StepProps<"data">) {
  const t = useTranslations("onboarding.data");
  const [start, setStart] = useState<"empty" | "demo">(initial?.start ?? "empty");

  return (
    <form
      id={STEP_FORM_ID}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ start });
      }}
      role="radiogroup"
      className="grid gap-3 sm:grid-cols-3"
    >
      {OPTIONS.map(({ key, icon: Icon, disabled }, i) => {
        const active = start === key;
        return (
          <motion.button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => key !== "import" && setStart(key)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={disabled ? undefined : { y: -3 }}
            className={cn(
              "bg-card focus-visible:ring-ring relative grid gap-3 rounded-xl border p-5 text-left transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
              active ? "border-primary ring-primary ring-2" : "hover:border-primary/40",
            )}
          >
            <span className={cn("grid size-11 place-content-center rounded-xl", active ? "bg-brand text-white" : "bg-muted text-muted-foreground")}>
              <Icon className="size-5" />
            </span>
            <span className="grid gap-1">
              <span className="flex items-center gap-2 font-semibold">
                {t(`${key}.title`)} {disabled && <Badge variant="outline">{t("soon")}</Badge>}
              </span>
              <span className="text-muted-foreground text-sm">{t(`${key}.description`)}</span>
            </span>
          </motion.button>
        );
      })}
    </form>
  );
}
