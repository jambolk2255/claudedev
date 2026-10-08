"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { registerOwnerSchema, type AuthUser, type RegisterOwnerInput } from "@stockflow/schemas";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Lock } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetMe } from "@/hooks/use-auth";
import { useZodMessage } from "@/hooks/use-zod-message";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import { fadeUp, stagger } from "@/lib/motion";
import { PasswordInput, PasswordStrength } from "./password-input";

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const msg = useZodMessage();
  const router = useRouter();
  const setMe = useSetMe();
  const status = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => api<{ needsSetup: boolean; signupOpen: boolean; saas?: boolean; trialDays?: number }>("/auth/setup-status"),
  });

  const form = useForm<RegisterOwnerInput>({
    resolver: zodResolver(registerOwnerSchema),
    defaultValues: { companyName: "", name: "", email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const password = form.watch("password");

  async function onSubmit(values: RegisterOwnerInput) {
    try {
      const res = await api<{ user: AuthUser }>("/auth/register", { method: "POST", body: values });
      setMe(res.user);
      router.replace("/onboarding");
    } catch (err) {
      handleFormError(err, form.setError);
    }
  }

  if (status.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-full" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (status.data && !status.data.signupOpen) {
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="grid gap-4 text-center">
        <span className="bg-muted mx-auto grid size-14 place-content-center rounded-2xl">
          <Lock className="text-muted-foreground size-6" />
        </span>
        <h1 className="text-2xl font-semibold">{t("closedTitle")}</h1>
        <p className="text-muted-foreground">{t("closedBody")}</p>
        <Button asChild variant="outline">
          <Link href="/login">{t("toLogin")}</Link>
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div variants={stagger(0.07)} initial="hidden" animate="show" className="grid gap-6">
      <motion.div variants={fadeUp} className="grid gap-2">
        <span className="bg-primary/10 text-primary inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
          <Building2 className="size-3.5" /> {status.data?.saas ? t("trialBadge", { days: status.data.trialDays ?? 14 }) : t("badge")}
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{status.data?.saas ? t("trialSubtitle") : t("subtitle")}</p>
      </motion.div>
      <motion.form variants={fadeUp} onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Field label={t("companyName")} htmlFor="companyName" error={msg(errors.companyName?.message)}>
          <Input id="companyName" autoFocus autoComplete="organization" aria-invalid={!!errors.companyName} {...form.register("companyName")} />
        </Field>
        <Field label={t("name")} htmlFor="name" error={msg(errors.name?.message)}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...form.register("name")} />
        </Field>
        <Field label={t("email")} htmlFor="email" error={msg(errors.email?.message)}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field label={t("password")} htmlFor="password" error={msg(errors.password?.message)} hint={!password ? t("passwordHint") : undefined}>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <PasswordStrength value={password} />
        <Button type="submit" variant="brand" size="lg" loading={isSubmitting}>
          {t("submit")}
          {!isSubmitting && <ArrowRight />}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          {t("haveAccount")}{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            {t("toLogin")}
          </Link>
        </p>
      </motion.form>
    </motion.div>
  );
}
