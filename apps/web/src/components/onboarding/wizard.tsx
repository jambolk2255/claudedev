"use client";

import { ONBOARDING_STEPS, type OnboardingData, type OnboardingState, type OnboardingStep } from "@stockflow/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ClipboardList,
  Database,
  Hash,
  Landmark,
  LayoutGrid,
  Shapes,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ME_KEY, useMe } from "@/hooks/use-auth";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import { slide } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Review } from "./review";
import { CompanyStep } from "./steps/company";
import { DataStep } from "./steps/data";
import { FinanceStep } from "./steps/finance";
import { IndustryStep } from "./steps/industry";
import { ModulesStep } from "./steps/modules";
import { NumberingStep } from "./steps/numbering";
import { TeamStep } from "./steps/team";
import { WarehousesStep } from "./steps/warehouses";
import { OnboardingSuccess } from "./success";
import { STEP_FORM_ID } from "./types";

type WizardStep = OnboardingStep | "review";
const ALL: WizardStep[] = [...ONBOARDING_STEPS, "review"];

const ICONS: Record<WizardStep, LucideIcon> = {
  company: Building2,
  industry: Shapes,
  modules: LayoutGrid,
  finance: Landmark,
  warehouses: Warehouse,
  numbering: Hash,
  team: Users,
  data: Database,
  review: ClipboardList,
};

export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const state = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api<OnboardingState>("/onboarding"),
    enabled: !!me.data && !me.data.organization.onboardingCompleted,
  });

  const [step, setStep] = useState<WizardStep | null>(null);
  const [direction, setDirection] = useState(1);
  const [data, setData] = useState<OnboardingData>({});
  const [completed, setCompleted] = useState<Set<OnboardingStep>>(new Set());
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState<{ email: string; inviteUrl: string }[] | null>(null);

  useEffect(() => {
    if (me.data?.organization.onboardingCompleted && !finished) router.replace("/dashboard");
    else if (me.data && !me.data.permissions.includes("organization.manage")) router.replace("/dashboard");
  }, [me.data, finished, router]);

  useEffect(() => {
    if (state.data && step === null) {
      setData(state.data.data);
      setCompleted(new Set(state.data.completedSteps));
      const allDone = ONBOARDING_STEPS.every((s) => state.data.completedSteps.includes(s));
      setStep(allDone ? "review" : state.data.currentStep);
    }
  }, [state.data, step]);

  const index = step ? ALL.indexOf(step) : 0;
  const progress = ((index + (finished ? 1 : 0)) / ALL.length) * 100;

  function go(next: WizardStep) {
    setDirection(ALL.indexOf(next) > index ? 1 : -1);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save<K extends OnboardingStep>(key: K, values: NonNullable<OnboardingData[K]>) {
    setSaving(true);
    try {
      const res = await api<OnboardingState>(`/onboarding/${key}`, { method: "PUT", body: values });
      setData(res.data);
      setCompleted(new Set(res.completedSteps));
      go(ALL[ALL.indexOf(key) + 1]!);
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    try {
      const res = await api<{ invites: { email: string; inviteUrl: string }[] }>("/onboarding/complete", { method: "POST" });
      setFinished(res.invites);
      await qc.invalidateQueries({ queryKey: ME_KEY });
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  const firstOpen = ONBOARDING_STEPS.find((s) => !completed.has(s));
  const canVisit = (s: WizardStep) => (s === "review" ? !firstOpen : completed.has(s) || s === firstOpen);

  const stepProps = { data } as const;
  const panel = (() => {
    switch (step) {
      case "company":
        return <CompanyStep {...stepProps} initial={data.company} onSubmit={(v) => save("company", v)} />;
      case "industry":
        return <IndustryStep {...stepProps} initial={data.industry} onSubmit={(v) => save("industry", v)} />;
      case "modules":
        return <ModulesStep {...stepProps} initial={data.modules} onSubmit={(v) => save("modules", v)} />;
      case "finance":
        return <FinanceStep {...stepProps} initial={data.finance} onSubmit={(v) => save("finance", v)} />;
      case "warehouses":
        return <WarehousesStep {...stepProps} initial={data.warehouses} onSubmit={(v) => save("warehouses", v)} />;
      case "numbering":
        return <NumberingStep {...stepProps} initial={data.numbering} onSubmit={(v) => save("numbering", v)} />;
      case "team":
        return <TeamStep {...stepProps} initial={data.team} onSubmit={(v) => save("team", v)} />;
      case "data":
        return <DataStep {...stepProps} initial={data.data} onSubmit={(v) => save("data", v)} />;
      case "review":
        return <Review data={data} onEdit={go} />;
      default:
        return null;
    }
  })();

  return (
    <div className="relative min-h-dvh overflow-clip">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="bg-primary/20 pointer-events-none absolute -top-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full blur-[120px]" />

      <header className="relative flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-1">
          <LocaleSwitcher persist />
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile progress bar */}
      <div className="bg-muted relative mx-4 h-1.5 overflow-hidden rounded-full lg:hidden">
        <motion.div className="bg-brand h-full" animate={{ width: `${progress}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      </div>

      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[260px_1fr] lg:py-10">
        <nav aria-label={t("progressLabel")} className="hidden lg:block">
          <ol className="sticky top-8 grid gap-1">
            {ALL.map((s, i) => {
              const Icon = ICONS[s];
              const active = s === step;
              const done = s !== "review" && completed.has(s);
              return (
                <li key={s}>
                  <button
                    type="button"
                    disabled={!canVisit(s) || !!finished}
                    onClick={() => go(s)}
                    aria-current={active ? "step" : undefined}
                    className="group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {active && (
                      <motion.span
                        layoutId="wizard-active"
                        className="bg-card absolute inset-0 rounded-xl border shadow-sm"
                        transition={{ type: "spring", stiffness: 400, damping: 34 }}
                      />
                    )}
                    <span
                      className={cn(
                        "relative grid size-8 shrink-0 place-content-center rounded-lg border transition-colors",
                        done
                          ? "border-success/30 bg-success/15 text-success"
                          : active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-card text-muted-foreground",
                      )}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={done ? "done" : "icon"}
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.4, opacity: 0 }}
                        >
                          {done && !active ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4" />}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <span className="relative grid">
                      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">{t("stepOf", { n: i + 1, total: ALL.length })}</span>
                      <span className={cn("font-medium", active ? "text-foreground" : "text-muted-foreground group-enabled:group-hover:text-foreground")}>
                        {t(`steps.${s}`)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="min-w-0">
          <div className="bg-card/80 shadow-primary/5 rounded-2xl border shadow-xl backdrop-blur-sm">
            {!step || state.isPending ? (
              <div className="grid gap-4 p-6 sm:p-8">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              </div>
            ) : finished ? (
              <div className="p-6 sm:p-8">
                <OnboardingSuccess invites={finished} onContinue={() => router.replace("/dashboard")} />
              </div>
            ) : (
              <>
                <div className="overflow-clip p-6 sm:p-8">
                  <AnimatePresence mode="wait" custom={direction} initial={false}>
                    <motion.div key={step} custom={direction} variants={slide} initial="enter" animate="center" exit="exit" className="grid gap-6">
                      <div className="grid gap-1.5">
                        <span className="text-primary text-xs font-medium uppercase tracking-wide lg:hidden">
                          {t("stepOf", { n: index + 1, total: ALL.length })}
                        </span>
                        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t(`${step}.title`)}</h1>
                        <p className="text-muted-foreground">{t(`${step}.subtitle`)}</p>
                      </div>
                      {panel}
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="bg-muted/30 flex items-center justify-between gap-3 rounded-b-2xl border-t px-6 py-4 sm:px-8">
                  <Button type="button" variant="ghost" disabled={index === 0 || saving} onClick={() => go(ALL[index - 1]!)}>
                    <ArrowLeft /> {tc("back")}
                  </Button>
                  {step === "review" ? (
                    <Button type="button" variant="brand" size="lg" loading={saving} onClick={finish}>
                      {t("finish")} {!saving && <Check />}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      {(step === "team" || step === "numbering") && (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={saving}
                          onClick={() =>
                            step === "team"
                              ? save("team", { invites: [] })
                              : save("numbering", data.numbering ?? { prefixes: {}, includeYear: true, padding: 5 })
                          }
                        >
                          {tc("skip")}
                        </Button>
                      )}
                      <Button type="submit" form={STEP_FORM_ID} variant="brand" loading={saving}>
                        {tc("continue")} {!saving && <ArrowRight />}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
