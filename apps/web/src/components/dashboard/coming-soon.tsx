"use client";

import { Check, Hammer } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { PLANNED_MODULES } from "@/components/layout/nav";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fadeUp, stagger } from "@/lib/motion";

/** Placeholder for modules scheduled in later phases: shows exactly what is coming. */
export function ComingSoon({ moduleKey }: { moduleKey: string }) {
  const t = useTranslations("planned");
  const tn = useTranslations("nav.items");
  const item = PLANNED_MODULES.find((m) => m.key === moduleKey)!;
  const Icon = item.icon;
  const features = t.raw(`${moduleKey}.features`) as string[];

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
      <motion.div variants={fadeUp}>
        <PageHeader title={tn(moduleKey)} description={t(`${moduleKey}.summary`)} actions={<Badge variant="outline">{t("phase", { n: item.phase! })}</Badge>} />
      </motion.div>
      <motion.div variants={fadeUp}>
        <Card className="relative overflow-clip p-8">
          <div className="bg-primary/15 pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[auto_1fr] lg:items-start">
            <motion.span
              className="bg-brand shadow-primary/30 grid size-20 place-content-center rounded-3xl text-white shadow-2xl"
              animate={{ rotate: [0, -4, 4, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Icon className="size-9" />
            </motion.span>
            <div className="grid gap-4">
              <div className="text-primary flex items-center gap-2 text-sm font-medium">
                <Hammer className="size-4" /> {t("building")}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {features.map((f, i) => (
                  <motion.li
                    key={f}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span className="bg-primary/10 text-primary mt-0.5 grid size-5 shrink-0 place-content-center rounded-full">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {f}
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
