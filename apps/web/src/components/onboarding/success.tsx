"use client";

import { ArrowRight, Copy } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  angle: (i / 18) * Math.PI * 2,
  distance: 90 + (i % 3) * 30,
  color: ["#5b4bdb", "#9b4fd6", "#22b8cf", "#f5b84c", "#34c38f"][i % 5],
}));

export function OnboardingSuccess({ invites, onContinue }: { invites: { email: string; inviteUrl: string }[]; onContinue: () => void }) {
  const t = useTranslations("onboarding.success");

  return (
    <div className="grid place-items-center gap-6 py-6 text-center">
      <div className="relative grid size-28 place-content-center">
        {CONFETTI.map((c, i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 size-2 rounded-full"
            style={{ background: c.color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
            animate={{ x: Math.cos(c.angle) * c.distance, y: Math.sin(c.angle) * c.distance, opacity: 0, scale: [0, 1.4, 1] }}
            transition={{ duration: 1.1, delay: 0.35, ease: "easeOut" }}
          />
        ))}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className="bg-brand shadow-primary/40 grid size-24 place-content-center rounded-full shadow-2xl"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-12 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
            />
          </svg>
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="grid gap-2">
        <h2 className="text-2xl font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground max-w-md">{t("body")}</p>
      </motion.div>
      {invites.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="grid w-full max-w-lg gap-2 text-left">
          <p className="text-sm font-medium">{t("invitesTitle")}</p>
          {invites.map((inv) => (
            <div key={inv.email} className="bg-card flex items-center gap-2 rounded-lg border p-2 pl-3 text-sm">
              <span className="flex-1 truncate">{inv.email}</span>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(inv.inviteUrl).then(() => toast.success(t("copied")))}>
                <Copy /> {t("copyLink")}
              </Button>
            </div>
          ))}
        </motion.div>
      )}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
        <Button variant="brand" size="lg" onClick={onContinue}>
          {t("cta")} <ArrowRight />
        </Button>
      </motion.div>
    </div>
  );
}
