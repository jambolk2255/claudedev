"use client";

import { MODULE_KEYS, type PlanSummary } from "@stockflow/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import { cn } from "@/lib/utils";

type Plan = PlanSummary & { subscribers: number };

export function PlatformPlans() {
  const q = useQuery({ queryKey: ["platform", "plans"], queryFn: () => api<Plan[]>("/platform/plans") });
  if (!q.data) return <Skeleton className="h-96" />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {q.data.map((p) => (
        <PlanEditor key={p.code} plan={p} />
      ))}
    </div>
  );
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function PlanEditor({ plan }: { plan: Plan }) {
  const t = useTranslations("platform.plans");
  const tm = useTranslations("modules");
  const qc = useQueryClient();
  const [d, setD] = useState({
    name: plan.name,
    description: plan.description,
    priceMonthly: String(plan.priceMonthly),
    priceYearly: String(plan.priceYearly),
    maxUsers: plan.maxUsers?.toString() ?? "",
    maxWarehouses: plan.maxWarehouses?.toString() ?? "",
    maxProducts: plan.maxProducts?.toString() ?? "",
    modules: new Set(plan.modules),
    active: plan.active,
  });
  const save = useMutation({
    mutationFn: () =>
      api(`/platform/plans/${plan.code}`, {
        method: "PUT",
        body: {
          name: d.name,
          description: d.description,
          priceMonthly: Number(d.priceMonthly),
          priceYearly: Number(d.priceYearly),
          maxUsers: numOrNull(d.maxUsers),
          maxWarehouses: numOrNull(d.maxWarehouses),
          maxProducts: numOrNull(d.maxProducts),
          modules: MODULE_KEYS.filter((m) => d.modules.has(m)),
          active: d.active,
        },
      }),
    onSuccess: () => {
      toast.success(t("saved", { name: d.name }));
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e) => handleFormError(e),
  });
  const id = (k: string) => `p-${plan.code}-${k}`;

  return (
    <Card className="grid content-start gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-wide">{plan.code}</span>
        <Badge variant="secondary">{t("subscribers", { count: plan.subscribers })}</Badge>
      </div>
      <Field label={t("name")} htmlFor={id("name")}>
        <Input id={id("name")} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <Field label={t("description")} htmlFor={id("desc")}>
        <Textarea id={id("desc")} rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("monthly")} htmlFor={id("pm")}>
          <Input id={id("pm")} type="number" min={0} value={d.priceMonthly} onChange={(e) => setD({ ...d, priceMonthly: e.target.value })} />
        </Field>
        <Field label={t("yearly")} htmlFor={id("py")}>
          <Input id={id("py")} type="number" min={0} value={d.priceYearly} onChange={(e) => setD({ ...d, priceYearly: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {(["maxUsers", "maxWarehouses", "maxProducts"] as const).map((k) => (
          <Field key={k} label={t(k)} htmlFor={id(k)}>
            <Input id={id(k)} type="number" min={1} placeholder="∞" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{t("modules")}</span>
        <div className="flex flex-wrap gap-1.5">
          {MODULE_KEYS.map((m) => {
            const on = d.modules.has(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                disabled={m === "inventory"}
                onClick={() => {
                  const next = new Set(d.modules);
                  if (on) next.delete(m);
                  else next.add(m);
                  setD({ ...d, modules: next });
                }}
                className={cn("h-7 rounded-md border px-2 text-xs", on ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground")}
              >
                {tm(`${m}.name`)}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={d.active} onCheckedChange={(v) => setD({ ...d, active: v })} /> {t("active")}
      </label>
      <Button onClick={() => save.mutate()} loading={save.isPending}>
        {t("save")}
      </Button>
    </Card>
  );
}
