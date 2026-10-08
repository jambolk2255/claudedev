"use client";

import { ONBOARDING_STEPS, type OnboardingData, type OnboardingState, type OnboardingStep } from "@stockflow/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
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
      <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-8">
          <Logo />
          <span className="text-muted-foreground hidden text-sm sm:inline">{t("metaTitle")}</span>
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitcher persist />
            <ThemeToggle />
          </div>
        </div>
        <div className="bg-muted h-0.5">
          <motion.div className="bg-primary h-full" animate={{ width: `${progress}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
        </div>
      </header>

      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[220px_1fr] lg:py-10">
        <nav aria-label={t("progressLabel")} className="hidden lg:block">
          <ol className="sticky top-24 grid">
            {ALL.map((s, i) => {
              const active = s === step;
              const done = s !== "review" && completed.has(s);
              const last = i === ALL.length - 1;
              return (
                <li key={s} className="relative">
                  {!last && <span aria-hidden className={cn("absolute bottom-0 left-[15px] top-8 w-px", done ? "bg-primary/40" : "bg-border")} />}
                  <button
                    type="button"
                    disabled={!canVisit(s) || !!finished}
                    onClick={() => go(s)}
                    aria-current={active ? "step" : undefined}
                    className="group relative flex w-full items-center gap-3 pb-4 text-left text-sm disabled:cursor-not-allowed"
                  >
                    <span
                      className={cn(
                        "bg-background relative grid size-[31px] shrink-0 place-content-center rounded-full border text-xs font-semibold tabular-nums transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground ring-primary/15 ring-4"
                          : done
                            ? "border-primary/40 text-primary"
                            : "text-muted-foreground",
                      )}
                    >
                      {done && !active ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "transition-colors",
                        active ? "text-foreground font-medium" : done ? "text-foreground/80 group-hover:text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t(`steps.${s}`)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="min-w-0">
          <div className="bg-card shadow-card rounded-xl border">
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
                <div className="bg-muted/30 flex items-center justify-between gap-3 rounded-b-xl border-t px-6 py-4 sm:px-8">
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
