"use client";

import { partnerInputSchema, type PartnerType } from "@stockflow/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LocationPicker } from "@/components/maps/location-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useZodMessage } from "@/hooks/use-zod-message";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Partner } from "@/lib/types";

type Draft = Record<
  "code" | "name" | "contactName" | "email" | "phone" | "taxNo" | "address" | "city" | "notes" | "creditLimit" | "paymentTermsDays",
  string
> & {
  latitude: number | null;
  longitude: number | null;
  active: boolean;
};

const fromPartner = (p: Partner | null): Draft => ({
  code: p?.code ?? "",
  name: p?.name ?? "",
  contactName: p?.contactName ?? "",
  email: p?.email ?? "",
  phone: p?.phone ?? "",
  taxNo: p?.taxNo ?? "",
  address: p?.address ?? "",
  city: p?.city ?? "",
  notes: p?.notes ?? "",
  creditLimit: p?.creditLimit != null ? String(Number(p.creditLimit)) : "",
  paymentTermsDays: String(p?.paymentTermsDays ?? 0),
  latitude: p?.latitude != null ? Number(p.latitude) : null,
  longitude: p?.longitude != null ? Number(p.longitude) : null,
  active: p?.active ?? true,
});

export function PartnerFormSheet({
  type,
  open,
  onOpenChange,
  partner,
}: {
  type: PartnerType;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partner: Partner | null;
}) {
  const t = useTranslations("contacts.form");
  const tc = useTranslations("common");
  const msg = useZodMessage();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(fromPartner(partner));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setD(fromPartner(partner));
      setErrors({});
    }
  }, [open, partner]);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });

  async function save() {
    const parsed = partnerInputSchema.safeParse({
      ...d,
      type,
      creditLimit: d.creditLimit === "" ? null : Number(d.creditLimit),
      paymentTermsDays: d.paymentTermsDays === "" ? 0 : Number(d.paymentTermsDays),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setSaving(true);
    try {
      await api(partner ? `/partners/${partner.id}` : "/partners", { method: partner ? "PUT" : "POST", body: parsed.data });
      toast.success(partner ? t("updated") : t("created"));
      await qc.invalidateQueries({ queryKey: ["partners"] });
      onOpenChange(false);
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={partner ? t(`edit.${type}`) : t(`new.${type}`)}
        description={partner?.code}
        closeLabel={tc("close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={save} loading={saving}>
              {tc("save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
            <Field label={t("name")} htmlFor="pt-name" error={msg(errors.name)}>
              <Input id="pt-name" autoFocus value={d.name} onChange={set("name")} aria-invalid={!!errors.name} />
            </Field>
            <Field label={t("code")} htmlFor="pt-code" hint={!partner ? t("codeHint") : undefined} error={errors.code ? t("codeInvalid") : undefined}>
              <Input id="pt-code" className="font-mono uppercase" value={d.code} onChange={set("code")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("contactName")} htmlFor="pt-contact" optional={tc("optional")}>
              <Input id="pt-contact" value={d.contactName} onChange={set("contactName")} />
            </Field>
            <Field label={t("phone")} htmlFor="pt-phone" optional={tc("optional")}>
              <Input id="pt-phone" type="tel" value={d.phone} onChange={set("phone")} />
            </Field>
            <Field label={t("email")} htmlFor="pt-email" optional={tc("optional")} error={msg(errors.email)}>
              <Input id="pt-email" type="email" value={d.email} onChange={set("email")} />
            </Field>
            <Field label={t("taxNo")} htmlFor="pt-tax" optional={tc("optional")}>
              <Input id="pt-tax" value={d.taxNo} onChange={set("taxNo")} />
            </Field>
          </div>
          <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <Field label={t("paymentTerms")} htmlFor="pt-terms" hint={t("paymentTermsHint")} error={msg(errors.paymentTermsDays)}>
              <Input id="pt-terms" type="number" min={0} max={365} value={d.paymentTermsDays} onChange={set("paymentTermsDays")} />
            </Field>
            {type === "customer" && (
              <Field label={t("creditLimit")} htmlFor="pt-credit" optional={tc("optional")} error={msg(errors.creditLimit)}>
                <Input id="pt-credit" type="number" min={0} step="any" value={d.creditLimit} onChange={set("creditLimit")} />
              </Field>
            )}
          </div>
          <div className="grid gap-4 border-t pt-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <Field label={t("address")} htmlFor="pt-address" optional={tc("optional")}>
                <Input id="pt-address" value={d.address} onChange={set("address")} />
              </Field>
              <Field label={t("city")} htmlFor="pt-city" optional={tc("optional")}>
                <Input id="pt-city" value={d.city} onChange={set("city")} />
              </Field>
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t("location")}</span>
              <LocationPicker
                idPrefix="pt"
                value={d.latitude !== null && d.longitude !== null ? { lat: d.latitude, lng: d.longitude } : null}
                onChange={(v) => setD({ ...d, latitude: v?.lat ?? null, longitude: v?.lng ?? null })}
              />
            </div>
            <Field label={t("notes")} htmlFor="pt-notes" optional={tc("optional")}>
              <Textarea id="pt-notes" rows={3} value={d.notes} onChange={set("notes")} />
            </Field>
            <label htmlFor="pt-active" className="flex items-center justify-between rounded-md border p-3 text-sm font-medium">
              {t("active")}
              <Switch id="pt-active" checked={d.active} onCheckedChange={(v) => setD({ ...d, active: v })} />
            </label>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
