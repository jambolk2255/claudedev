"use client";

import { ArrowDownToLine, ArrowUpFromLine, BellRing, MapPin, PackageCheck, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

const floating = [
  { icon: ArrowDownToLine, key: "grn", tone: "text-emerald-300", x: "8%", y: "18%", delay: 0 },
  { icon: BellRing, key: "lowStock", tone: "text-amber-300", x: "58%", y: "10%", delay: 0.4 },
  { icon: ArrowUpFromLine, key: "dispatch", tone: "text-sky-300", x: "62%", y: "62%", delay: 0.8 },
  { icon: MapPin, key: "warehouse", tone: "text-pink-300", x: "6%", y: "70%", delay: 1.2 },
] as const;

/** Decorative right-hand panel on auth screens: animated gradient blobs and live-looking cards. */
export function AuthShowcase() {
  const t = useTranslations("auth.showcase");
  return (
    <aside className="relative hidden overflow-clip bg-[#141128] lg:block" aria-hidden>
      <motion.div
        className="absolute -left-24 -top-32 size-[520px] rounded-full bg-[#5b4bdb] opacity-60 blur-[120px]"
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-80px] right-[-120px] size-[480px] rounded-full bg-[#22b8cf] opacity-40 blur-[120px]"
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/3 top-1/3 size-[360px] rounded-full bg-[#b44fd6] opacity-35 blur-[110px]"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="bg-grid absolute inset-0 opacity-[0.07]" />

      <div className="relative flex h-full flex-col justify-between p-12 text-white">
        <div className="relative h-[55%]">
          {floating.map(({ icon: Icon, key, tone, x, y, delay }) => (
            <motion.div
              key={key}
              className="absolute flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 shadow-2xl backdrop-blur-md"
              style={{ left: x, top: y }}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: [0, -8, 0], scale: 1 }}
              transition={{
                opacity: { delay, duration: 0.6 },
                scale: { delay, duration: 0.6 },
                y: { delay, duration: 6, repeat: Infinity, ease: "easeInOut" },
              }}
            >
              <span className={`grid size-9 place-content-center rounded-xl bg-white/10 ${tone}`}>
                <Icon className="size-4" />
              </span>
              <span className="grid text-sm leading-tight">
                <span className="font-medium">{t(`${key}.title`)}</span>
                <span className="text-xs text-white/60">{t(`${key}.detail`)}</span>
              </span>
            </motion.div>
          ))}
          <motion.div
            className="absolute left-[26%] top-[38%] w-64 rounded-2xl border border-white/10 bg-white/[0.08] p-4 shadow-2xl backdrop-blur-md"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.7 }}
          >
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>{t("chart.title")}</span>
              <span className="flex items-center gap-1 text-emerald-300">
                <TrendingUp className="size-3" /> 18%
              </span>
            </div>
            <div className="mt-3 flex h-20 items-end gap-1.5">
              {[40, 55, 35, 70, 60, 85, 75, 95].map((h, i) => (
                <motion.span
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-[#5b4bdb] to-[#22b8cf]"
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ delay: 0.5 + i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="max-w-md">
          <PackageCheck className="mb-4 size-8 text-[#8fe3f0]" />
          <h2 className="text-3xl font-semibold leading-tight">{t("headline")}</h2>
          <p className="mt-3 text-white/70">{t("subline")}</p>
        </motion.div>
      </div>
    </aside>
  );
}
