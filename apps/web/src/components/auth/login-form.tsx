"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type AuthUser } from "@stockflow/schemas";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSetMe } from "@/hooks/use-auth";
import { useZodMessage } from "@/hooks/use-zod-message";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, api } from "@/lib/api";
import { homeFor } from "@/lib/auth-redirect";
import { handleFormError } from "@/lib/form-errors";
import { fadeUp, stagger } from "@/lib/motion";
import { OtpInput } from "./otp-input";
import { PasswordInput } from "./password-input";

type FormValues = { email: string; password: string };

export function LoginForm() {
  const t = useTranslations("auth.login");
  const msg = useZodMessage();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const setMe = useSetMe();
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setup = useQuery({ queryKey: ["setup-status"], queryFn: () => api<{ needsSetup: boolean; saas?: boolean; trialDays?: number }>("/auth/setup-status") });
  const form = useForm<FormValues>({ resolver: zodResolver(loginSchema.pick({ email: true, password: true })), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      const res = await api<{ user: AuthUser } | { requiresTwoFactor: true }>("/auth/login", {
        method: "POST",
        body: { ...values, ...(needsTotp ? { totp } : {}) },
      });
      if ("requiresTwoFactor" in res) {
        setNeedsTotp(true);
        return;
      }
      setMe(res.user);
      router.replace(homeFor(res.user, next));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(err.code === "LOCKED" ? t("locked") : err.code === "INVALID_TOTP" ? t("invalidCode") : t("invalid"));
        if (err.code === "INVALID_TOTP") setTotp("");
        return;
      }
      handleFormError(err);
    }
  }

  return (
    <motion.div variants={stagger(0.07)} initial="hidden" animate="show" className="grid gap-6">
      <motion.div variants={fadeUp} className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{needsTotp ? t("twoFactorTitle") : t("title")}</h1>
        <p className="text-muted-foreground">{needsTotp ? t("twoFactorSubtitle") : t("subtitle")}</p>
      </motion.div>

      <AnimatePresence>
        {(setup.data?.needsSetup || setup.data?.saas) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Link
              href="/register"
              className="border-primary/30 bg-primary/5 hover:bg-primary/10 group flex items-center gap-3 rounded-xl border p-3 text-sm transition"
            >
              <Sparkles className="text-primary size-5" />
              <span className="flex-1">{setup.data.needsSetup ? t("firstRun") : t("startTrial", { days: setup.data.trialDays ?? 14 })}</span>
              <ArrowRight className="text-primary size-4 transition group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.form variants={fadeUp} onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <AnimatePresence mode="wait" initial={false}>
          {!needsTotp ? (
            <motion.div key="credentials" className="grid gap-4" exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
              <Field label={t("email")} htmlFor="email" error={msg(errors.email?.message)}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@company.lk"
                  aria-invalid={!!errors.email}
                  {...form.register("email")}
                />
              </Field>
              <Field label={t("password")} htmlFor="password" error={msg(errors.password?.message)}>
                <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
              </Field>
            </motion.div>
          ) : (
            <motion.div key="totp" className="grid gap-3" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}>
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <ShieldCheck className="text-success size-4" /> {t("twoFactorHint")}
              </div>
              <OtpInput value={totp} onChange={setTotp} autoFocus invalid={!!error} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }}
              exit={{ opacity: 0 }}
              className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <Button type="submit" variant="brand" size="lg" loading={isSubmitting} disabled={needsTotp && totp.length !== 6}>
          {needsTotp ? t("verify") : t("submit")}
          {!isSubmitting && <ArrowRight />}
        </Button>
        {needsTotp && (
          <Button type="button" variant="ghost" onClick={() => (setNeedsTotp(false), setTotp(""), setError(null))}>
            {t("back")}
          </Button>
        )}
      </motion.form>
    </motion.div>
  );
}
