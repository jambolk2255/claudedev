"use client";

import { DEFAULT_DOCUMENT_PREFIXES, DOCUMENT_TYPES, numberingStepSchema, type DocumentType } from "@stockflow/schemas";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { STEP_FORM_ID, type StepProps } from "../types";

export function formatDocNumber(prefix: string, includeYear: boolean, padding: number, n = 1) {
  return [prefix || "—", includeYear ? new Date().getFullYear() : null, String(n).padStart(padding, "0")].filter(Boolean).join("-");
}

export function NumberingStep({ initial, onSubmit }: StepProps<"numbering">) {
  const t = useTranslations("onboarding.numbering");
  const td = useTranslations("documents");
  const [prefixes, setPrefixes] = useState<Record<DocumentType, string>>({ ...DEFAULT_DOCUMENT_PREFIXES, ...initial?.prefixes });
  const [includeYear, setIncludeYear] = useState(initial?.includeYear ?? true);
  const [padding, setPadding] = useState(initial?.padding ?? 5);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  return (
    <form
      id={STEP_FORM_ID}
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = numberingStepSchema.safeParse({ prefixes, includeYear, padding });
        if (!parsed.success) return setInvalid(new Set(parsed.error.issues.map((i) => String(i.path[1]))));
        void onSubmit(parsed.data);
      }}
      className="grid gap-5"
    >
      <div className="bg-card flex flex-wrap items-center gap-6 rounded-xl border p-4">
        <label htmlFor="includeYear" className="flex items-center gap-3 text-sm font-medium">
          <Switch id="includeYear" checked={includeYear} onCheckedChange={setIncludeYear} /> {t("includeYear")}
        </label>
        <div className="flex items-center gap-3">
          <Label htmlFor="padding">{t("digits")}</Label>
          <NativeSelect id="padding" className="w-20" value={padding} onChange={(e) => setPadding(Number(e.target.value))}>
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {DOCUMENT_TYPES.map((type, i) => (
          <motion.div
            key={type}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="bg-card flex items-center gap-3 rounded-xl border p-3"
          >
            <div className="grid flex-1 gap-0.5">
              <Label htmlFor={`prefix-${type}`}>{td(type)}</Label>
              <motion.span
                key={`${prefixes[type]}-${includeYear}-${padding}`}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                className="text-muted-foreground font-mono text-xs"
              >
                {formatDocNumber(prefixes[type], includeYear, padding)}
              </motion.span>
            </div>
            <Input
              id={`prefix-${type}`}
              className="w-24 font-mono uppercase"
              maxLength={6}
              aria-invalid={invalid.has(type) || undefined}
              value={prefixes[type]}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                setPrefixes((p) => ({ ...p, [type]: v }));
                setInvalid((s) => (s.delete(type), new Set(s)));
              }}
            />
          </motion.div>
        ))}
      </div>
      {invalid.size > 0 && (
        <p role="alert" className="text-destructive text-sm">
          {t("invalid")}
        </p>
      )}
    </form>
  );
}
