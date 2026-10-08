"use client";

import { BILLING_INTERVALS, SUBSCRIPTION_STATUSES, type PlanSummary, type SubscriptionState, type SubscriptionStatus } from "@stockflow/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ListSkeleton, PAGE_SIZE, usePagedList } from "@/components/commerce/ui";
import { EmptyState, Pagination, SearchInput, Toolbar } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import { PlatformInvoiceBadge } from "./payments";

interface TenantRow {
  id: string;
  name: string;
  city: string | null;
  createdAt: string;
  onboardingCompletedAt: string | null;
  owner: { name: string; email: string; lastLoginAt: string | null } | null;
  subscription: { status: SubscriptionStatus; plan: { code: string; name: string }; state: SubscriptionState } | null;
  _count: { users: number; products: number; invoices: number };
}

interface TenantDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  createdAt: string;
  modules: string[];
  usage: { users: number; warehouses: number; products: number };
  counts: { products: number; warehouses: number; invoices: number; orders: number };
  users: { id: string; name: string; email: string; active: boolean; lastLoginAt: string | null; role: { name: string } }[];
  subscription: {
    status: SubscriptionStatus;
    interval: "month" | "year";
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    note: string | null;
    plan: PlanSummary;
    state: SubscriptionState;
  } | null;
  invoices: {
    id: string;
    number: string;
    amount: string;
    status: "pending" | "paid" | "cancelled" | "failed";
    method: string;
    createdAt: string;
    plan: { name: string };
  }[];
}

const STATE_VARIANT: Record<string, "success" | "warning" | "destructive" | "default" | "secondary"> = {
  trialing: "default",
  active: "success",
  past_due: "warning",
  cancelled: "secondary",
  expired: "destructive",
  suspended: "destructive",
};

export function StateBadge({ status }: { status: string }) {
  const t = useTranslations("billing.status");
  return <Badge variant={STATE_VARIANT[status] ?? "secondary"}>{t.has(status) ? t(status) : status}</Badge>;
}

export function TenantsList() {
  const t = useTranslations("platform.tenants");
  const f = useFormat();
  const [open, setOpen] = useState<string | null>(null);
  const { query, search, setSearch, page, setPage } = usePagedList<TenantRow>("/platform/tenants", "platform", {});
  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t("search")} className="min-w-56 flex-1" />
      </Toolbar>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.data?.items.length === 0 ? (
        <EmptyState icon={Building2} title={t("empty")} />
      ) : (
        <Table className={query.isPlaceholderData ? "opacity-60" : undefined}>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.company")}</TH>
              <TH className="hidden md:table-cell">{t("cols.owner")}</TH>
              <TH>{t("cols.plan")}</TH>
              <TH className="hidden text-right sm:table-cell">{t("cols.users")}</TH>
              <TH className="hidden text-right lg:table-cell">{t("cols.products")}</TH>
              <TH className="hidden lg:table-cell">{t("cols.joined")}</TH>
            </TR>
          </THead>
          <TBody>
            {query.data?.items.map((o) => (
              <TR key={o.id} className="cursor-pointer" onClick={() => setOpen(o.id)}>
                <TD>
                  <span className="text-sm font-medium">{o.name}</span>
                  {o.city && <span className="text-muted-foreground block text-xs">{o.city}</span>}
                </TD>
                <TD className="hidden text-sm md:table-cell">
                  {o.owner?.name}
                  <span className="text-muted-foreground block text-xs">{o.owner?.email}</span>
                </TD>
                <TD>
                  {o.subscription ? (
                    <span className="flex flex-wrap items-center gap-1.5 text-sm">
                      {o.subscription.plan.name} <StateBadge status={o.subscription.state.status} />
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="hidden text-right tabular-nums sm:table-cell">{o._count.users}</TD>
                <TD className="hidden text-right tabular-nums lg:table-cell">{o._count.products}</TD>
                <TD className="text-muted-foreground hidden text-sm lg:table-cell">{f.date(o.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {query.data && query.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPage={setPage} />}
      {open && <TenantSheet id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function TenantSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("platform.tenants");
  const ts = useTranslations("billing.status");
  const tc = useTranslations("common");
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["platform", "tenant", id], queryFn: () => api<TenantDetail>(`/platform/tenants/${id}`) });
  const plans = useQuery({ queryKey: ["platform", "plans"], queryFn: () => api<PlanSummary[]>("/platform/plans") });
  const [form, setForm] = useState({ planCode: "", status: "active" as SubscriptionStatus, interval: "month" as "month" | "year", periodEnd: "", reason: "" });

  useEffect(() => {
    const s = q.data?.subscription;
    if (!s) return;
    const end = (s.status === "trialing" ? s.trialEndsAt : s.currentPeriodEnd) ?? new Date().toISOString();
    setForm({ planCode: s.plan.code, status: s.status, interval: s.interval, periodEnd: end.slice(0, 10), reason: s.note ?? "" });
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => api(`/platform/tenants/${id}/subscription`, { method: "PUT", body: { ...form, reason: form.reason || undefined } }),
    onSuccess: () => {
      toast.success(t("saved"));
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e) => handleFormError(e),
  });

  const d = q.data;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={d?.name ?? "…"}
        description={d ? [d.city, d.email, d.phone].filter(Boolean).join(" · ") : undefined}
        closeLabel={tc("close")}
        className="max-w-2xl"
        footer={
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.planCode || !form.periodEnd}>
            {t("saveSubscription")}
          </Button>
        }
      >
        {!d ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="grid gap-6">
            <div className="grid grid-cols-3 gap-3 text-center">
              {(["users", "warehouses", "products"] as const).map((k) => (
                <div key={k} className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xl font-semibold tabular-nums">{d.usage[k]}</p>
                  <p className="text-muted-foreground text-xs">{t(`usage.${k}`)}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {t("subscription")} {d.subscription && <StateBadge status={d.subscription.state.status} />}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("plan")} htmlFor="ts-plan">
                  <NativeSelect id="ts-plan" value={form.planCode} onChange={(e) => setForm({ ...form, planCode: e.target.value })}>
                    {(plans.data ?? []).map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={t("status")} htmlFor="ts-status">
                  <NativeSelect id="ts-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SubscriptionStatus })}>
                    {SUBSCRIPTION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ts(s)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={t("interval")} htmlFor="ts-interval">
                  <NativeSelect id="ts-interval" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value as "month" | "year" })}>
                    {BILLING_INTERVALS.map((i) => (
                      <option key={i} value={i}>
                        {t(`intervals.${i}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={t(form.status === "trialing" ? "trialEnds" : "periodEnds")} htmlFor="ts-end">
                  <Input id="ts-end" type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
                </Field>
                <Field label={t("note")} htmlFor="ts-note" className="sm:col-span-2">
                  <Input id="ts-note" maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                </Field>
              </div>
            </div>

            <div className="grid gap-2">
              <p className="text-sm font-semibold">{t("users")}</p>
              <ul className="divide-y rounded-lg border">
                {d.users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{u.name}</span> <span className="text-muted-foreground">· {u.role.name}</span>
                      <span className="text-muted-foreground block truncate text-xs">{u.email}</span>
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap text-xs">{u.lastLoginAt ? f.dateTime(u.lastLoginAt) : t("neverLoggedIn")}</span>
                  </li>
                ))}
              </ul>
            </div>

            {d.invoices.length > 0 && (
              <div className="grid gap-2">
                <p className="text-sm font-semibold">{t("payments")}</p>
                <ul className="divide-y rounded-lg border">
                  {d.invoices.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-mono">{i.number}</span>
                      <span className="text-muted-foreground">{i.plan.name}</span>
                      <span className="ml-auto tabular-nums">{f.money(i.amount)}</span>
                      <PlatformInvoiceBadge status={i.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
