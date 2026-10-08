"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { companyStepSchema } from "@stockflow/schemas";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useZodMessage } from "@/hooks/use-zod-message";
import { STEP_FORM_ID, type StepProps } from "../types";

type Values = z.input<typeof companyStepSchema>;

export function CompanyStep({ initial, onSubmit }: StepProps<"company">) {
  const t = useTranslations("onboarding.company");
  const tc = useTranslations("common");
  const msg = useZodMessage();
  const form = useForm<Values>({
    resolver: zodResolver(companyStepSchema),
    defaultValues: { name: "", legalName: "", registrationNo: "", vatNo: "", email: "", phone: "", address: "", city: "", country: "LK", ...initial },
  });
  const e = form.formState.errors;

  return (
    <form id={STEP_FORM_ID} onSubmit={form.handleSubmit((v) => onSubmit(companyStepSchema.parse(v)))} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label={t("name")} htmlFor="name" error={msg(e.name?.message)} className="sm:col-span-2">
        <Input id="name" autoFocus aria-invalid={!!e.name} {...form.register("name")} />
      </Field>
      <Field label={t("legalName")} htmlFor="legalName" optional={tc("optional")} error={msg(e.legalName?.message)}>
        <Input id="legalName" placeholder={t("legalNamePlaceholder")} {...form.register("legalName")} />
      </Field>
      <Field label={t("registrationNo")} htmlFor="registrationNo" optional={tc("optional")} error={msg(e.registrationNo?.message)}>
        <Input id="registrationNo" placeholder="PV 00123456" {...form.register("registrationNo")} />
      </Field>
      <Field label={t("vatNo")} htmlFor="vatNo" optional={tc("optional")} error={msg(e.vatNo?.message)}>
        <Input id="vatNo" placeholder="123456789-7000" {...form.register("vatNo")} />
      </Field>
      <Field label={t("phone")} htmlFor="phone" optional={tc("optional")} error={msg(e.phone?.message)}>
        <Input id="phone" type="tel" placeholder="+94 77 123 4567" {...form.register("phone")} />
      </Field>
      <Field label={t("email")} htmlFor="email" optional={tc("optional")} error={msg(e.email?.message)}>
        <Input id="email" type="email" placeholder="accounts@company.lk" {...form.register("email")} />
      </Field>
      <Field label={t("city")} htmlFor="city" optional={tc("optional")} error={msg(e.city?.message)}>
        <Input id="city" placeholder={t("cityPlaceholder")} {...form.register("city")} />
      </Field>
      <Field label={t("address")} htmlFor="address" optional={tc("optional")} error={msg(e.address?.message)} className="sm:col-span-2">
        <Textarea id="address" rows={2} {...form.register("address")} />
      </Field>
    </form>
  );
}
