"use client";

import type { BillingInterval, BillingOverview, LimitKey, PayHereCheckout, PlanSummary } from "@stockflow/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, CheckCircle2, Clock, CreditCard, Landmark, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/commerce/ui";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ME_KEY, useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import { cn } from "@/lib/utils";

type State = NonNullable<BillingOverview["subscription"]>["state"]["status"];
const STATE_BADGE: Record<State, "success" | "warning" | "destructive" | "default" | "secondary"> = {
  trialing: "default",
  active: "success",
  past_due: "warning",
  cancelled: "secondary",
  expired: "destructive",
  suspended: "destructive",
};
const LIMITS: { key: LimitKey; field: "maxUsers" | "maxWarehouses" | "maxProducts" }[] = [
  { key: "users", field: "maxUsers" },
  { key: "warehouses", field: "maxWarehouses" },
  { key: "products", field: "maxProducts" },
];

/** Sends the browser to PayHere with the signed checkout form. */
function submitToPayHere(checkout: PayHereCheckout) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.action;
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export function BillingPage({ paid, cancelled }: { paid?: string; cancelled?: string }) {
  const t = useTranslations("billing");
  const tm = useTranslations("modules");
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [buying, setBuying] = useState<PlanSummary | null>(null);
  const q = useQuery({ queryKey: ["billing"], queryFn: () => api<BillingOverview>("/billing"), refetchInterval: paid ? 5000 : false });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/billing/invoices/${id}/cancel`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["billing"] }),
    onError: (e) => handleFormError(e),
  });

  if (!q.data) return <Skeleton className="h-96" />;
  const b = q.data;
  if (!b.enabled || !b.subscription) {
    return (
      <>
        <PageHeader level="section" title={t("title")} description={t("subtitle")} />
        <Card className="text-muted-foreground p-6 text-sm">{t("disabled")}</Card>
      </>
    );
  }
  const sub = b.subscription;
  const manage = can("organization.manage");
  const money = (v: number) => f.money(v);
  const periodLabel = sub.status === "trialing" ? "trialEnds" : "paidUntil";
  const periodDate = sub.status === "trialing" ? sub.trialEndsAt : sub.currentPeriodEnd;
  const pendingInvoice = b.invoices.find((i) => i.status === "pending" && i.method === "bank_transfer");

  return (
    <>
      <PageHeader level="section" title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6">
        {paid && (
          <Card className="border-success/40 bg-success/5 flex items-center gap-3 p-4 text-sm">
            <CheckCircle2 className="text-success size-5" />
            {t("paidNotice", { number: paid })}
          </Card>
        )}
        {cancelled && (
          <Card className="border-warning/40 bg-warning/5 flex items-center gap-3 p-4 text-sm">
            <X className="text-warning size-5" />
            {t("cancelledNotice")}
          </Card>
        )}

        <Card className="grid gap-5 p-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="grid content-start gap-2">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{t("currentPlan")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-semibold">{sub.plan.name}</span>
              <Badge variant={STATE_BADGE[sub.state.status]}>{t(`status.${sub.state.status}`)}</Badge>
            </div>
            {periodDate && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Clock className="size-4" />
                {t(periodLabel, { date: f.date(periodDate) })}
                {sub.state.daysLeft !== null && sub.state.daysLeft >= 0 && <span>· {t("daysLeft", { count: sub.state.daysLeft })}</span>}
              </p>
            )}
            {sub.state.readOnly && <p className="text-destructive text-sm font-medium">{t(sub.state.blocked ? "suspendedHint" : "readOnlyHint")}</p>}
          </div>
          <div className="grid content-start gap-3">
            {LIMITS.map(({ key, field }) => {
              const max = sub.plan[field];
              const used = b.usage[key];
              return (
                <div key={key} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{t(`limits.${key}`)}</span>
                    <span className="text-muted-foreground tabular-nums">{max === null ? t("usedUnlimited", { used }) : t("usedOf", { used, max })}</span>
                  </div>
                  <Progress value={used} max={max ?? 0} className={cn(max !== null && used >= max && "[&>div]:bg-warning")} />
                </div>
              );
            })}
          </div>
        </Card>

        {pendingInvoice && (
          <Card className="border-primary/30 bg-primary/5 flex flex-wrap items-center gap-3 p-4 text-sm">
            <Landmark className="text-primary size-5" />
            <span className="flex-1">{t("pendingTransfer", { number: pendingInvoice.number, plan: pendingInvoice.plan.name })}</span>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{t("choosePlan")}</h3>
          <div role="tablist" className="bg-muted inline-flex rounded-lg p-1">
            {(["month", "year"] as const).map((i) => (
              <button
                key={i}
                role="tab"
                aria-selected={interval === i}
                onClick={() => setInterval(i)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                  interval === i ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(i === "month" ? "monthly" : "yearly")}
                {i === "year" && <span className="text-success ml-1.5 text-xs">{t("save")}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {b.plans.map((p) => {
            const current = p.code === sub.plan.code && sub.status !== "trialing";
            const price = interval === "year" ? p.priceYearly : p.priceMonthly;
            return (
              <Card
                key={p.code}
                data-testid={`plan-${p.code}`}
                className={cn("flex flex-col gap-4 p-5", p.code === sub.plan.code && "border-primary ring-primary/15 ring-4")}
              >
                <div className="grid gap-1">
                  <span className="flex items-center justify-between gap-2 text-lg font-semibold">
                    {p.name}
                    {p.code === "business" && <Badge>{t("popular")}</Badge>}
                  </span>
                  <span className="text-muted-foreground text-sm">{p.description}</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-1">
                  <span className="text-2xl font-bold tabular-nums xl:text-3xl">{money(price)}</span>
                  <span className="text-muted-foreground text-sm">/{t(interval === "year" ? "perYear" : "perMonth")}</span>
                </div>
                <ul className="grid gap-1.5 text-sm">
                  {LIMITS.map(({ key, field }) => (
                    <li key={key} className="flex items-center gap-2">
                      <Check className="text-success size-4 shrink-0" />
                      {p[field] === null ? t(`unlimited.${key}`) : t(`upTo.${key}`, { count: p[field] })}
                    </li>
                  ))}
                  {p.modules
                    .filter((m) => m !== "inventory")
                    .map((m) => (
                      <li key={m} className="text-muted-foreground flex items-center gap-2">
                        <Check className="size-4 shrink-0 opacity-60" />
                        {tm.has(`${m}.name`) ? tm(`${m}.name`) : m}
                      </li>
                    ))}
                </ul>
                <Button className="mt-auto" variant={current ? "outline" : "default"} disabled={!manage} onClick={() => setBuying(p)}>
                  {current ? t("renew") : t("choose")}
                </Button>
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden">
          <div className="border-b px-5 py-3 text-sm font-semibold">{t("history")}</div>
          {b.invoices.length === 0 ? (
            <p className="text-muted-foreground px-5 py-6 text-sm">{t("noHistory")}</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{t("cols.number")}</TH>
                  <TH className="hidden sm:table-cell">{t("cols.date")}</TH>
                  <TH>{t("cols.plan")}</TH>
                  <TH className="hidden md:table-cell">{t("cols.method")}</TH>
                  <TH className="text-right">{t("cols.amount")}</TH>
                  <TH>{t("cols.status")}</TH>
                  <TH className="w-px" />
                </TR>
              </THead>
              <TBody>
                {b.invoices.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-mono text-sm">{i.number}</TD>
                    <TD className="text-muted-foreground hidden text-sm sm:table-cell">{f.date(i.createdAt)}</TD>
                    <TD className="text-sm">
                      {i.plan.name} · {t(i.interval === "year" ? "yearly" : "monthly")}
                      {i.periodEnd && <span className="text-muted-foreground block text-xs">{t("until", { date: f.date(i.periodEnd) })}</span>}
                    </TD>
                    <TD className="hidden text-sm md:table-cell">{t(`methods.${i.method}`)}</TD>
                    <TD className="text-right font-medium tabular-nums">{f.money(i.amount)}</TD>
                    <TD>
                      <Badge variant={i.status === "paid" ? "success" : i.status === "pending" ? "warning" : "secondary"}>
                        {t(`invoiceStatus.${i.status}`)}
                      </Badge>
                    </TD>
                    <TD>
                      {i.status === "pending" && manage && (
                        <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate(i.id)}>
                          {t("cancel")}
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {buying && <PayDialog plan={buying} interval={interval} overview={b} onClose={() => setBuying(null)} />}
    </>
  );
}

function PayDialog({ plan, interval, overview, onClose }: { plan: PlanSummary; interval: BillingInterval; overview: BillingOverview; onClose: () => void }) {
  const t = useTranslations("billing");
  const tc = useTranslations("common");
  const f = useFormat();
  const qc = useQueryClient();
  const [method, setMethod] = useState<"payhere" | "bank">(overview.payhere ? "payhere" : "bank");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = interval === "year" ? plan.priceYearly : plan.priceMonthly;

  async function pay() {
    setBusy(true);
    try {
      if (method === "payhere") {
        submitToPayHere(await api<PayHereCheckout>("/billing/checkout", { method: "POST", body: { planCode: plan.code, interval } }));
        return;
      }
      const res = await api<{ number: string }>("/billing/bank-transfer", { method: "POST", body: { planCode: plan.code, interval, reference } });
      toast.success(t("transferRecorded", { number: res.number }));
      await Promise.all([qc.invalidateQueries({ queryKey: ["billing"] }), qc.invalidateQueries({ queryKey: ME_KEY })]);
      onClose();
    } catch (err) {
      handleFormError(err);
    }
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={tc("close")}>
        <DialogHeader>
          <DialogTitle>{t("payTitle", { plan: plan.name })}</DialogTitle>
          <DialogDescription>
            {f.money(amount)} · {t(interval === "year" ? "oneYear" : "oneMonth")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div role="radiogroup" aria-label={t("method")} className="grid grid-cols-2 gap-2">
            {[
              { key: "payhere" as const, icon: CreditCard, label: t("payOnline"), hint: t("payOnlineHint"), disabled: !overview.payhere },
              { key: "bank" as const, icon: Building2, label: t("bankTransfer"), hint: t("bankTransferHint"), disabled: false },
            ].map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={method === m.key}
                disabled={m.disabled}
                onClick={() => setMethod(m.key)}
                className={cn(
                  "grid gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-40",
                  method === m.key ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <m.icon className="size-4" /> {m.label}
                </span>
                <span className="text-muted-foreground text-xs">{m.hint}</span>
              </button>
            ))}
          </div>
          {method === "bank" && (
            <>
              {overview.bankDetails && <p className="bg-muted whitespace-pre-line rounded-lg p-3 text-sm">{overview.bankDetails}</p>}
              <Field label={t("reference")} htmlFor="b-ref" hint={t("referenceHint")}>
                <Input id="b-ref" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </>
          )}
          <Button size="lg" loading={busy} disabled={method === "bank" && reference.trim().length < 3} onClick={pay}>
            {method === "payhere" ? t("payNow", { amount: f.money(amount) }) : t("iHavePaid")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
