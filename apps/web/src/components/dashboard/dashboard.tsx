"use client";

import type { AuthUser, Paginated } from "@stockflow/schemas";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, LayoutGrid, Lock, MapPin, ShieldCheck, ShieldOff, UserPlus, Users, Warehouse, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { visibleCreateActions } from "@/components/layout/nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan, useMe } from "@/hooks/use-auth";
import { Link, useRouter } from "@/i18n/navigation";
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
interface AuditRow {
  id: string;
  action: string;
  createdAt: string;
  user: { name: string } | null;
}

const DISMISS_KEY = "sf.setup.dismissed";

function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function SetupProgress({ me, overview }: { me: AuthUser; overview?: Overview }) {
  const t = useTranslations("dashboard.checklist");
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const steps = [
    { key: "company", done: me.organization.onboardingCompleted, href: "/settings/company" },
    { key: "warehouse", done: (overview?.warehouses.length ?? 0) > 0, href: "/settings/company" },
    { key: "team", done: (overview?.users ?? 0) > 1, href: "/settings/users?invite=1" },
    { key: "twoFactor", done: me.twoFactorEnabled, href: "/settings/security" },
    { key: "products", done: false, locked: true },
    { key: "grn", done: false, locked: true },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done && !s.locked);
  if (!overview || dismissed || !next) return null;

  return (
    <motion.div variants={fadeUp}>
      <Card className="mb-6 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="grid flex-1 gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{t("title")}</p>
              <span className="text-muted-foreground text-xs tabular-nums">{t("progress", { done, total: steps.length })}</span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <motion.div
                className="bg-primary h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(done / steps.length) * 100}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
              {steps.map((s) => (
                <li
                  key={s.key}
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    s.done ? "text-muted-foreground" : s.locked ? "text-muted-foreground/70" : "text-foreground",
                  )}
                >
                  {s.done ? (
                    <Check className="text-success size-3.5" strokeWidth={3} />
                  ) : s.locked ? (
                    <Lock className="size-3" />
                  ) : (
                    <span className="border-muted-foreground/50 size-3 rounded-full border" />
                  )}
                  {t(`items.${s.key}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2 lg:pl-6">
            <Button asChild size="sm">
              <Link href={next.href!}>
                {t(`items.${next.key}`)} <ArrowRight />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("dismiss")}
              onClick={() => {
                setDismissed(true);
                try {
                  localStorage.setItem(DISMISS_KEY, "1");
                } catch {
                  /* storage unavailable */
                }
              }}
            >
              <X />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  footnote,
  href,
}: {
  icon: typeof Warehouse;
  label: string;
  value?: React.ReactNode;
  footnote?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <Card className={cn("h-full p-4 transition-colors", href && "hover:border-primary/40")}>
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value ?? <Skeleton className="h-8 w-14" />}</div>
      {footnote && <div className="text-muted-foreground mt-1 truncate text-xs">{footnote}</div>}
    </Card>
  );
  return (
    <motion.div variants={fadeUp} className="h-full">
      {href ? (
        <Link href={href} className="block h-full rounded-lg">
          {body}
        </Link>
      ) : (
        body
      )}
    </motion.div>
  );
}

export function Dashboard() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("create");
  const format = useFormatter();
  const router = useRouter();
  const can = useCan();
  const { data: me } = useMe();
  const overview = useQuery({ queryKey: ["organization", "overview"], queryFn: () => api<Overview>("/organization/overview") });
  const activity = useQuery({ queryKey: ["audit", "recent"], queryFn: () => api<Paginated<AuditRow>>("/audit?pageSize=6"), enabled: can("audit.view") });

  if (!me) return null;
  const defaultWarehouse = overview.data?.warehouses.find((w) => w.isDefault);
  const actions = visibleCreateActions(me.organization.modules, me.permissions);

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-muted-foreground text-sm">{format.dateTime(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t(`greeting.${greetingKey()}`, { name: me.name.split(" ")[0] ?? me.name })}</h1>
        </div>
        <div className="flex items-center gap-2">
          {can("users.invite") && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/users?invite=1">
                <UserPlus /> {t("inviteTeam")}
              </Link>
            </Button>
          )}
        </div>
      </motion.div>

      <SetupProgress me={me} overview={overview.data} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat
          icon={Warehouse}
          label={t("stats.warehouses")}
          value={overview.data && <AnimatedNumber value={overview.data.warehouses.length} />}
          footnote={defaultWarehouse && t("stats.defaultIs", { name: defaultWarehouse.name })}
        />
        <Stat
          icon={Users}
          label={t("stats.team")}
          value={overview.data && <AnimatedNumber value={overview.data.users} />}
          footnote={t("stats.roles", { count: overview.data?.roles ?? 0 })}
          href={can("users.view") ? "/settings/users" : undefined}
        />
        <Stat
          icon={LayoutGrid}
          label={t("stats.modules")}
          value={<AnimatedNumber value={me.organization.modules.length} />}
          footnote={t(`mode.${me.organization.mode}`)}
          href={can("organization.view") ? "/settings/company" : undefined}
        />
        <Stat
          icon={me.twoFactorEnabled ? ShieldCheck : ShieldOff}
          label={t("stats.security")}
          value={
            <span className={me.twoFactorEnabled ? "text-success" : "text-warning-foreground dark:text-warning"}>
              {me.twoFactorEnabled ? t("stats.twoFactorOn") : t("stats.twoFactorOff")}
            </span>
          }
          footnote={me.twoFactorEnabled ? t("stats.protected") : t("stats.enable2fa")}
          href="/settings/security"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid content-start gap-6">
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>{t("quickActions.title")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {actions.map((a) => {
                  const ready = !!a.href;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      disabled={!ready}
                      onClick={() => a.href && router.push(a.href)}
                      className={cn(
                        "focus-visible:ring-ring focus-visible:ring-3 group flex flex-col items-start gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-none",
                        ready ? "hover:border-primary/40 hover:bg-accent/50" : "cursor-not-allowed opacity-60",
                      )}
                    >
                      <span
                        className={cn("grid size-8 place-content-center rounded-md", ready ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}
                      >
                        <a.icon className="size-4" />
                      </span>
                      <span className="grid gap-0.5">
                        <span className={cn("text-sm font-medium", !ready && "text-muted-foreground")}>{tc(`actions.${a.key}`)}</span>
                        {a.phase && <span className="text-muted-foreground text-[11px]">{tc("phase", { n: a.phase })}</span>}
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>

          {can("audit.view") && (
            <motion.div variants={fadeUp}>
              <Card>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle>{t("activity.title")}</CardTitle>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/settings/audit">
                      {t("activity.viewAll")} <ArrowRight />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {activity.isPending ? (
                    <div className="grid gap-3">
                      {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-9" />
                      ))}
                    </div>
                  ) : (
                    <ul className="grid">
                      <AnimatePresence initial={false}>
                        {activity.data?.items.map((row) => {
                          const key = row.action.replace(/\./g, "_");
                          return (
                            <motion.li key={row.id} layout className="flex items-center gap-3 border-b py-2.5 last:border-0">
                              <Avatar name={row.user?.name ?? "System"} className="size-7 text-[10px]" />
                              <p className="min-w-0 flex-1 truncate text-sm">
                                <span className="font-medium">{row.user?.name ?? t("activity.system")}</span>{" "}
                                <span className="text-muted-foreground">{t.has(`activity.actions.${key}`) ? t(`activity.actions.${key}`) : row.action}</span>
                              </p>
                              <time className="text-muted-foreground shrink-0 text-xs" dateTime={row.createdAt}>
                                {format.relativeTime(new Date(row.createdAt))}
                              </time>
                            </motion.li>
                          );
                        })}
                      </AnimatePresence>
                    </ul>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        <motion.div variants={fadeUp} className="grid content-start gap-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle>{t("warehouses.title")}</CardTitle>
              <Badge variant="secondary">{overview.data?.warehouses.length ?? "–"}</Badge>
            </CardHeader>
            <CardContent className="grid gap-1">
              {overview.isPending
                ? [0, 1].map((i) => <Skeleton key={i} className="h-12" />)
                : overview.data?.warehouses.map((w) => (
                    <div key={w.id} className="hover:bg-accent/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors">
                      <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-content-center rounded-md">
                        <Warehouse className="size-4" />
                      </span>
                      <div className="grid min-w-0 flex-1 leading-tight">
                        <span className="flex items-center gap-2 truncate text-sm font-medium">
                          {w.name} {w.isDefault && <Badge variant="default">{t("warehouses.default")}</Badge>}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          <span className="font-mono">{w.code}</span>
                          {w.address && ` · ${w.address}`}
                        </span>
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

          {overview.data && overview.data.taxRates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>{t("tax.title")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {overview.data.taxRates.map((r) => (
                  <div key={r.code} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{r.code}</span>
                    <span className="font-medium tabular-nums">{Number(r.rate)}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
