"use client";

import { INDUSTRY_PRESETS, type OnboardingData, type OnboardingStep } from "@stockflow/schemas";
import { Pencil } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { stagger, fadeUp } from "@/lib/motion";
import { formatDocNumber } from "./steps/numbering";

function Section({ title, step, onEdit, children }: { title: string; step: OnboardingStep; onEdit: (s: OnboardingStep) => void; children: React.ReactNode }) {
  const t = useTranslations("common");
  return (
    <motion.section variants={fadeUp} className="bg-card grid gap-2 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(step)}>
          <Pencil /> {t("edit")}
        </Button>
      </div>
      <div className="text-muted-foreground text-sm">{children}</div>
    </motion.section>
  );
}

export function Review({ data, onEdit }: { data: OnboardingData; onEdit: (s: OnboardingStep) => void }) {
  const t = useTranslations("onboarding");
  const tm = useTranslations("modules");
  const locale = useLocale();
  const month = data.finance ? new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2026, data.finance.fiscalYearStartMonth - 1, 1)) : "";

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
      <Section title={t("steps.company")} step="company" onEdit={onEdit}>
        <p className="text-foreground font-medium">{data.company?.name}</p>
        {[data.company?.vatNo && `VAT ${data.company.vatNo}`, data.company?.city].filter(Boolean).join(" · ")}
      </Section>
      <Section title={t("steps.industry")} step="industry" onEdit={onEdit}>
        {data.industry && (
          <>
            <p className="text-foreground font-medium">{t(`industry.options.${data.industry.industry}`)}</p>
            {INDUSTRY_PRESETS[data.industry.industry].categories.length} {t("industry.categories").toLowerCase()}
          </>
        )}
      </Section>
      <Section title={t("steps.modules")} step="modules" onEdit={onEdit}>
        {data.modules && (
          <div className="grid gap-2">
            <p className="text-foreground font-medium">{t(`modules.${data.modules.mode}.title`)}</p>
            <div className="flex flex-wrap gap-1">
              {data.modules.modules.map((m) => (
                <Badge key={m} variant="secondary">
                  {tm(`${m}.name`)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Section>
      <Section title={t("steps.finance")} step="finance" onEdit={onEdit}>
        {data.finance && (
          <>
            <p className="text-foreground font-medium">
              {data.finance.currency} · {t(`finance.methods.${data.finance.valuationMethod}.title`)}
            </p>
            {[
              data.finance.vatRegistered && `VAT ${data.finance.vatRate}%`,
              data.finance.ssclEnabled && `SSCL ${data.finance.ssclRate}%`,
              `${t("finance.fiscalYear")}: ${month}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </>
        )}
      </Section>
      <Section title={t("steps.warehouses")} step="warehouses" onEdit={onEdit}>
        {data.warehouses?.warehouses.map((w) => (
          <p key={w.code}>
            <span className="font-mono text-xs">{w.code}</span> — {w.name} {w.isDefault && <Badge className="ml-1">{t("warehouses.isDefault")}</Badge>}
          </p>
        ))}
      </Section>
      <Section title={t("steps.numbering")} step="numbering" onEdit={onEdit}>
        <span className="font-mono text-xs">
          {formatDocNumber(data.numbering?.prefixes.invoice ?? "INV", data.numbering?.includeYear ?? true, data.numbering?.padding ?? 5)}
        </span>
      </Section>
      <Section title={t("steps.team")} step="team" onEdit={onEdit}>
        {data.team?.invites.length ? t("review.invites", { count: data.team.invites.length }) : t("review.noInvites")}
      </Section>
      <Section title={t("steps.data")} step="data" onEdit={onEdit}>
        {t(`data.${data.data?.start ?? "empty"}.title`)}
      </Section>
    </motion.div>
  );
}
