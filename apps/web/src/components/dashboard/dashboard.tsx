"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, KeyRound, LayoutGrid, Lock, MapPin, Package, Percent, ShieldCheck, Truck, Users, Warehouse } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-auth";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { fadeUp, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./animated-number";

interface Overview {
  warehouses: { id: string; name: string; code: string; address: string | null; latitude: string | null; longitude: string | null; isDefault: boolean }[];
  users: number;
  roles: number;
  taxRates: { code: string; rate: string }[];
}

function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

const ROADMAP = [
  { phase: 1, key: "inventory", icon: Package },
  { phase: 2, key: "purchasing", icon: Truck },
  { phase: 3, key: "sales", icon: LayoutGrid },
  { phase: 4, key: "finance", icon: Percent },
] as const;

export function Dashboard() {
  const t = useTranslations("dashboard");
  const { data: me } = useMe();
  const overview = useQuery({ queryKey: ["organization", "overview"], queryFn: () => api<Overview>("/organization/overview") });

  if (!me) return null;

  const stats = [
    {
      key: "warehouses",
      icon: Warehouse,
      value: overview.data?.warehouses.length,
      tone: "from-violet-500/20 to-violet-500/0 text-violet-600 dark:text-violet-300",
    },
    { key: "team", icon: Users, value: overview.data?.users, tone: "from-sky-500/20 to-sky-500/0 text-sky-600 dark:text-sky-300" },
    {
      key: "modules",
      icon: LayoutGrid,
      value: me.organization.modules.length,
      tone: "from-emerald-500/20 to-emerald-500/0 text-emerald-600 dark:text-emerald-300",
    },
    { key: "roles", icon: KeyRound, value: overview.data?.roles, tone: "from-amber-500/20 to-amber-500/0 text-amber-600 dark:text-amber-300" },
  ];

  const checklist = [
    { key: "company", done: me.organization.onboardingCompleted, href: "/settings/company" },
    { key: "warehouse", done: (overview.data?.warehouses.length ?? 0) > 0, href: "/settings/company" },
    { key: "team", done: (overview.data?.users ?? 0) > 1, href: "/settings/users" },
    { key: "twoFactor", done: me.twoFactorEnabled, href: "/settings/security" },
    { key: "products", done: false, locked: true },
    { key: "grn", done: false, locked: true },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const pct = doneCount / checklist.length;

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.div variants={fadeUp}>
        <PageHeader
          title={t(`greeting.${greetingKey()}`, { name: me.name.split(" ")[0] ?? me.name })}
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              {me.organization.name}
              <Badge variant={me.organization.mode === "advanced" ? "default" : "secondary"}>{t(`mode.${me.organization.mode}`)}</Badge>
              <Badge variant="outline">{me.organization.currency}</Badge>
            </span>
          }
        />
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ key, icon: Icon, value, tone }) => (
          <motion.div key={key} variants={fadeUp} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
            <Card className="relative overflow-clip">
              <div className={cn("pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br blur-2xl", tone)} />
              <CardContent className="relative flex items-center justify-between gap-4 p-5">
                <div className="grid gap-1">
                  <span className="text-muted-foreground text-sm">{t(`stats.${key}`)}</span>
                  <span className="text-3xl font-semibold tracking-tight">
                    {value === undefined ? <Skeleton className="h-8 w-12" /> : <AnimatedNumber value={value} />}
                  </span>
                </div>
                <span className={cn("grid size-11 place-content-center rounded-xl bg-gradient-to-br", tone)}>
                  <Icon className="size-5" />
                </span>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <motion.div variants={fadeUp}>
          <Card className="h-full">
            <CardHeader className="flex-row items-center gap-4">
              <div className="relative size-14 shrink-0">
                <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-muted" strokeWidth="3" />
                  <motion.circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="url(#ring)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: pct }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                  />
                  <defs>
                    <linearGradient id="ring" x1="0" x2="1">
                      <stop offset="0" stopColor="#5b4bdb" />
                      <stop offset="1" stopColor="#22b8cf" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="absolute inset-0 grid place-content-center text-xs font-semibold">
                  {doneCount}/{checklist.length}
                </span>
              </div>
              <div className="grid gap-1">
                <CardTitle>{t("checklist.title")}</CardTitle>
                <CardDescription>{t("checklist.subtitle")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-1">
              {checklist.map((item, i) => (
                <motion.div key={item.key} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.05 }}>
                  {item.locked ? (
                    <div className="text-muted-foreground flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                      <span className="grid size-6 place-content-center rounded-full border border-dashed">
                        <Lock className="size-3" />
                      </span>
                      <span className="flex-1">{t(`checklist.items.${item.key}`)}</span>
                      <Badge variant="outline">{t("soon")}</Badge>
                    </div>
                  ) : (
                    <Link href={item.href!} className="hover:bg-accent/60 group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition">
                      <span
                        className={cn(
                          "grid size-6 place-content-center rounded-full border transition",
                          item.done ? "border-success bg-success text-success-foreground" : "group-hover:border-primary",
                        )}
                      >
                        {item.done && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span className={cn("flex-1", item.done && "text-muted-foreground decoration-muted-foreground/40 line-through")}>
                        {t(`checklist.items.${item.key}`)}
                      </span>
                      {!item.done && <ArrowRight className="text-muted-foreground group-hover:text-primary size-4 transition group-hover:translate-x-0.5" />}
                    </Link>
                  )}
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp} className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("warehouses.title")}</CardTitle>
              <CardDescription>{t("warehouses.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {overview.isPending
                ? [0, 1].map((i) => <Skeleton key={i} className="h-14" />)
                : overview.data?.warehouses.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <span className="bg-primary/10 text-primary grid size-9 place-content-center rounded-lg">
                        <Warehouse className="size-4" />
                      </span>
                      <div className="grid min-w-0 flex-1">
                        <span className="flex items-center gap-2 truncate text-sm font-medium">
                          {w.name} {w.isDefault && <Badge>{t("warehouses.default")}</Badge>}
                        </span>
                        <span className="text-muted-foreground truncate font-mono text-xs">{w.code}</span>
                      </div>
                      {w.latitude && w.longitude && (
                        <Button variant="ghost" size="icon" asChild>
                          <a
                            href={`https://www.google.com/maps?q=${w.latitude},${w.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("warehouses.openMap")}
                          >
                            <MapPin />
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("roadmap.title")}</CardTitle>
              <CardDescription>{t("roadmap.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative grid gap-4 border-l pl-6">
                {ROADMAP.map(({ phase, key, icon: Icon }, i) => (
                  <motion.li
                    key={key}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.08 }}
                    className="relative"
                  >
                    <span className="bg-card text-primary absolute -left-[37px] top-0.5 grid size-6 place-content-center rounded-full border">
                      <Icon className="size-3" />
                    </span>
                    <p className="text-sm font-medium">
                      {t("roadmap.phase", { n: phase })} · {t(`roadmap.items.${key}.title`)}
                    </p>
                    <p className="text-muted-foreground text-xs">{t(`roadmap.items.${key}.detail`)}</p>
                  </motion.li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {!me.twoFactorEnabled && (
        <motion.div variants={fadeUp} className="mt-6">
          <Card className="border-primary/30 from-primary/8 flex flex-col items-start gap-4 bg-gradient-to-r to-transparent p-5 sm:flex-row sm:items-center">
            <span className="bg-brand shadow-primary/30 grid size-11 place-content-center rounded-xl text-white shadow-lg">
              <ShieldCheck className="size-5" />
            </span>
            <div className="grid flex-1 gap-0.5">
              <p className="font-medium">{t("secure.title")}</p>
              <p className="text-muted-foreground text-sm">{t("secure.body")}</p>
            </div>
            <Button asChild>
              <Link href="/settings/security">{t("secure.cta")}</Link>
            </Button>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
