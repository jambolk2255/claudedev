"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { acceptInviteSchema, type AuthUser } from "@stockflow/schemas";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MailWarning, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetMe } from "@/hooks/use-auth";
import { useZodMessage } from "@/hooks/use-zod-message";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { homeFor } from "@/lib/auth-redirect";
import { handleFormError } from "@/lib/form-errors";
import { fadeUp, stagger } from "@/lib/motion";
import { PasswordInput, PasswordStrength } from "./password-input";

const formSchema = acceptInviteSchema.omit({ token: true });
type FormValues = z.infer<typeof formSchema>;

export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("auth.invite");
  const msg = useZodMessage();
  const router = useRouter();
  const setMe = useSetMe();
  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api<{ email: string; organization: string; role: string }>(`/auth/invitations/${encodeURIComponent(token)}`),
  });
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    try {
      const res = await api<{ user: AuthUser }>("/auth/accept-invite", { method: "POST", body: { ...values, token } });
      setMe(res.user);
      router.replace(homeFor(res.user, null));
    } catch (err) {
      handleFormError(err, form.setError);
    }
  }

  if (invite.isPending) return <Skeleton className="h-72 w-full rounded-2xl" />;

  if (invite.isError) {
    return (
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="grid gap-4 text-center">
        <span className="bg-destructive/10 mx-auto grid size-14 place-content-center rounded-2xl">
          <MailWarning className="text-destructive size-6" />
        </span>
        <h1 className="text-2xl font-semibold">{t("invalidTitle")}</h1>
        <p className="text-muted-foreground">{t("invalidBody")}</p>
        <Button asChild variant="outline">
          <Link href="/login">{t("toLogin")}</Link>
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div variants={stagger(0.07)} initial="hidden" animate="show" className="grid gap-6">
      <motion.div variants={fadeUp} className="grid gap-2">
        <span className="bg-brand shadow-primary/30 grid size-12 place-content-center rounded-2xl text-white shadow-lg">
          <UserPlus className="size-5" />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle", { organization: invite.data.organization, role: invite.data.role })}</p>
      </motion.div>
      <motion.form variants={fadeUp} onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Field label={t("email")} htmlFor="email">
          <Input id="email" value={invite.data.email} disabled readOnly />
        </Field>
        <Field label={t("name")} htmlFor="name" error={msg(errors.name?.message)}>
          <Input id="name" autoFocus autoComplete="name" aria-invalid={!!errors.name} {...form.register("name")} />
        </Field>
        <Field label={t("password")} htmlFor="password" error={msg(errors.password?.message)}>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <PasswordStrength value={form.watch("password")} />
        <Button type="submit" variant="brand" size="lg" loading={isSubmitting}>
          {t("submit")}
          {!isSubmitting && <ArrowRight />}
        </Button>
      </motion.form>
    </motion.div>
  );
}
