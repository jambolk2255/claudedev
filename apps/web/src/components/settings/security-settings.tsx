"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, type AuthUser } from "@stockflow/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Laptop, LogOut, QrCode, Save, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { OtpInput } from "@/components/auth/otp-input";
import { PasswordInput, PasswordStrength } from "@/components/auth/password-input";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ME_KEY, useMe, useSetMe } from "@/hooks/use-auth";
import { useZodMessage } from "@/hooks/use-zod-message";
import { usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";

function ProfileCard({ me }: { me: AuthUser }) {
  const t = useTranslations("settings.security.profile");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState(me.name);
  const [lang, setLang] = useState<"en" | "si">(locale === "si" ? "si" : "en");
  const save = useMutation({
    mutationFn: () => api("/users/me", { method: "PATCH", body: { name, locale: lang } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ME_KEY });
      toast.success(t("saved"));
      if (lang !== locale) router.replace(pathname, { locale: lang });
    },
    onError: (err) => handleFormError(err),
  });

  return (
    <Card id="profile">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{me.email}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} htmlFor="profile-name">
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("language")} htmlFor="profile-lang">
          <NativeSelect id="profile-lang" value={lang} onChange={(e) => setLang(e.target.value as "en" | "si")}>
            <option value="en">English</option>
            <option value="si">සිංහල</option>
          </NativeSelect>
        </Field>
      </CardContent>
      <CardFooter className="bg-muted/30 justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={name.trim().length < 2}>
          {!save.isPending && <Save />} {tc("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}

type PasswordValues = z.infer<typeof changePasswordSchema>;

function PasswordCard() {
  const t = useTranslations("settings.security.password");
  const msg = useZodMessage();
  const setMe = useSetMe();
  const form = useForm<PasswordValues>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", newPassword: "" } });
  const e = form.formState.errors;

  async function onSubmit(values: PasswordValues) {
    try {
      const res = await api<{ user: AuthUser }>("/auth/change-password", { method: "POST", body: values });
      setMe(res.user);
      form.reset();
      toast.success(t("changed"));
    } catch (err) {
      handleFormError(err, form.setError);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("current")} htmlFor="currentPassword" error={msg(e.currentPassword?.message)}>
            <PasswordInput id="currentPassword" autoComplete="current-password" {...form.register("currentPassword")} />
          </Field>
          <div className="grid gap-2">
            <Field label={t("new")} htmlFor="newPassword" error={msg(e.newPassword?.message)}>
              <PasswordInput id="newPassword" autoComplete="new-password" {...form.register("newPassword")} />
            </Field>
            <PasswordStrength value={form.watch("newPassword")} />
          </div>
        </CardContent>
        <CardFooter className="bg-muted/30 justify-end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            {!form.formState.isSubmitting && <KeyRound />} {t("submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function TwoFactorCard({ me }: { me: AuthUser }) {
  const t = useTranslations("settings.security.twoFactor");
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [disabling, setDisabling] = useState(false);

  const start = useMutation({
    mutationFn: () => api<{ qrDataUrl: string; secret: string }>("/auth/2fa/setup", { method: "POST" }),
    onSuccess: setSetup,
    onError: (e) => handleFormError(e),
  });
  const confirm = useMutation({
    mutationFn: () => api(disabling ? "/auth/2fa/disable" : "/auth/2fa/enable", { method: "POST", body: { code } }),
    onSuccess: async () => {
      toast.success(disabling ? t("disabled") : t("enabled"));
      setSetup(null);
      setDisabling(false);
      setCode("");
      await qc.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (e) => (setCode(""), handleFormError(e)),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-4">
        <span
          className={
            me.twoFactorEnabled
              ? "bg-success/15 text-success grid size-11 place-content-center rounded-xl"
              : "bg-muted text-muted-foreground grid size-11 place-content-center rounded-xl"
          }
        >
          {me.twoFactorEnabled ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}
        </span>
        <div className="grid flex-1 gap-1">
          <CardTitle className="flex items-center gap-2">
            {t("title")} <Badge variant={me.twoFactorEnabled ? "success" : "outline"}>{me.twoFactorEnabled ? t("on") : t("off")}</Badge>
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {setup || disabling ? (
            <motion.div
              key="verify"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="grid gap-5 overflow-hidden sm:grid-cols-[auto_1fr] sm:items-center"
            >
              {setup && (
                <div className="grid justify-items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={setup.qrDataUrl} alt={t("qrAlt")} className="size-44 rounded-xl border bg-white p-2" />
                  <code className="bg-muted max-w-44 break-all rounded px-2 py-1 text-center font-mono text-[10px]">{setup.secret}</code>
                </div>
              )}
              <div className="grid gap-3">
                <p className="text-muted-foreground text-sm">{setup ? t("scan") : t("confirmDisable")}</p>
                <div className="max-w-xs">
                  <OtpInput value={code} onChange={setCode} autoFocus />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => confirm.mutate()}
                    disabled={code.length !== 6}
                    loading={confirm.isPending}
                    variant={disabling ? "destructive" : "default"}
                  >
                    {disabling ? t("disable") : t("verify")}
                  </Button>
                  <Button variant="ghost" onClick={() => (setSetup(null), setDisabling(false), setCode(""))}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : me.twoFactorEnabled ? (
            <motion.div key="on" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Button variant="outline" onClick={() => setDisabling(true)}>
                <ShieldOff /> {t("disable")}
              </Button>
            </motion.div>
          ) : (
            <motion.div key="off" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Button onClick={() => start.mutate()} loading={start.isPending}>
                {!start.isPending && <QrCode />} {t("enable")}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  current: boolean;
}

function describeAgent(ua: string | null) {
  if (!ua) return { mobile: false, label: "Unknown device" };
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return { mobile, label: [browser, os].filter(Boolean).join(" · ") };
}

function SessionsCard() {
  const t = useTranslations("settings.security.sessions");
  const format = useFormatter();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<SessionRow[]>("/auth/sessions") });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    onError: (e) => handleFormError(e),
  });
  const others = useMutation({
    mutationFn: () => api("/auth/logout-others", { method: "POST" }),
    onSuccess: () => (toast.success(t("othersDone")), qc.invalidateQueries({ queryKey: ["sessions"] })),
    onError: (e) => handleFormError(e),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="grid gap-1">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </div>
        {(sessions.data?.length ?? 0) > 1 && (
          <Button variant="outline" size="sm" onClick={() => others.mutate()} loading={others.isPending}>
            {!others.isPending && <LogOut />} {t("logoutOthers")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-2">
        {sessions.isPending
          ? [0, 1].map((i) => <Skeleton key={i} className="h-14" />)
          : sessions.data?.map((s) => {
              const { mobile, label } = describeAgent(s.userAgent);
              const Icon = mobile ? Smartphone : Laptop;
              return (
                <motion.div key={s.id} layout className="flex items-center gap-3 rounded-lg border p-3">
                  <Icon className="text-muted-foreground size-5" />
                  <div className="grid flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {label} {s.current && <Badge variant="success">{t("current")}</Badge>}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {s.ip ?? "—"} · {format.relativeTime(new Date(s.createdAt))}
                    </span>
                  </div>
                  {!s.current && (
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)}>
                      {t("revoke")}
                    </Button>
                  )}
                </motion.div>
              );
            })}
      </CardContent>
    </Card>
  );
}

export function SecuritySettings() {
  const t = useTranslations("settings.security");
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <>
      <PageHeader level="section" title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6">
        <ProfileCard me={me} />
        <TwoFactorCard me={me} />
        <PasswordCard />
        <SessionsCard />
      </div>
    </>
  );
}
