"use client";

import { SYSTEM_ROLES, teamStepSchema } from "@stockflow/schemas";
import { Mail, Plus, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { STEP_FORM_ID, type StepProps } from "../types";

type Values = z.infer<typeof teamStepSchema>;
const INVITABLE = SYSTEM_ROLES.filter((r) => r.key !== "owner");

export function TeamStep({ initial, onSubmit }: StepProps<"team">) {
  const t = useTranslations("onboarding.team");
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const form = useForm<Values>({ resolver: zodResolver(teamStepSchema), defaultValues: initial ?? { invites: [] } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "invites" });
  const errors = form.formState.errors.invites;

  return (
    <form id={STEP_FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <AnimatePresence initial={false} mode="popLayout">
        {fields.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="grid place-items-center gap-2 rounded-xl border border-dashed p-8 text-center"
          >
            <span className="bg-muted grid size-12 place-content-center rounded-2xl">
              <Users className="text-muted-foreground size-5" />
            </span>
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="text-muted-foreground max-w-sm text-sm">{t("emptyBody")}</p>
          </motion.div>
        )}
        {fields.map((f, i) => (
          <motion.div
            key={f.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="bg-card grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_200px_auto]"
          >
            <div className="relative">
              <Mail className="text-muted-foreground pointer-events-none absolute left-3 top-3 size-4" />
              <Input
                type="email"
                className="pl-9"
                placeholder="name@company.lk"
                aria-label={t("email")}
                aria-invalid={!!errors?.[i]?.email}
                {...form.register(`invites.${i}.email`)}
              />
            </div>
            <NativeSelect aria-label={t("role")} {...form.register(`invites.${i}.roleKey`)}>
              {INVITABLE.map((r) => (
                <option key={r.key} value={r.key}>
                  {tr(`${r.key}.name`)}
                </option>
              ))}
            </NativeSelect>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={tc("remove")}>
              <Trash2 className="text-destructive" />
            </Button>
            {errors?.[i]?.email && <p className="text-destructive text-xs sm:col-span-3">{t("invalidEmail")}</p>}
          </motion.div>
        ))}
      </AnimatePresence>
      <Button type="button" variant="outline" className="border-dashed" onClick={() => append({ email: "", roleKey: "storekeeper" })}>
        <Plus /> {t("add")}
      </Button>
      <p className="text-muted-foreground text-xs">{t("linksNote")}</p>
    </form>
  );
}
