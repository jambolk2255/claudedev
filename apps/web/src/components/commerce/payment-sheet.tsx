"use client";

import { PAYMENT_METHODS, type Paginated, type PaymentMethod } from "@stockflow/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Account, InvoiceSummary, Partner, PaymentSummary } from "@/lib/types";
import { PartnerPicker } from "./partner-picker";
import { todayIso } from "./ui";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function useCashAccounts() {
  const q = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api<Account[]>("/finance/accounts") });
  return (q.data ?? []).filter((a) => a.isCash && a.active);
}

export const pickAccount = (accounts: Account[], method: PaymentMethod) =>
  (method === "cash" ? accounts.find((a) => /cash/i.test(a.name)) : accounts.find((a) => !/cash/i.test(a.name))) ?? accounts[0];

/** Record a customer receipt or supplier payment and allocate it to open invoices/bills. */
export function PaymentSheet({
  kind,
  partner: fixedPartner,
  invoiceId,
  open,
  onOpenChange,
}: {
  kind: "receipt" | "payment";
  partner?: { id: string; name: string; type?: Partner["type"] } | null;
  invoiceId?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("commerce.payment");
  const tm = useTranslations("commerce.methods");
  const tc = useTranslations("common");
  const f = useFormat();
  const qc = useQueryClient();
  const accounts = useCashAccounts();
  const [partner, setPartner] = useState<{ id: string; name: string } | null>(fixedPartner ?? null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState(todayIso());
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const invKind = kind === "receipt" ? "sales" : "purchase";
  const openInvoices = useQuery({
    queryKey: ["invoices", "open", invKind, partner?.id],
    enabled: !!partner && open,
    queryFn: async () => {
      const get = (status: string) => api<Paginated<InvoiceSummary>>(`/invoices?kind=${invKind}&partnerId=${partner!.id}&status=${status}&pageSize=100`);
      const [a, b] = await Promise.all([get("open"), get("partially_paid")]);
      return [...a.items, ...b.items].sort((x, y) => x.dueDate.localeCompare(y.dueDate));
    },
  });
  const invoices = useMemo(() => openInvoices.data ?? [], [openInvoices.data]);
  const balance = (i: InvoiceSummary) => round2(Number(i.total) - Number(i.amountPaid));

  useEffect(() => {
    const acc = pickAccount(accounts, method);
    if (acc) setAccountId(acc.id);
  }, [accounts, method]);

  // Pre-fill from the invoice the sheet was opened for.
  useEffect(() => {
    if (!invoiceId || !invoices.length) return;
    const inv = invoices.find((i) => i.id === invoiceId);
    if (inv) {
      setAmount(String(balance(inv)));
      setAlloc({ [inv.id]: String(balance(inv)) });
    }
  }, [invoiceId, invoices]);

  const allocated = round2(Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0));
  const amountNum = Number(amount) || 0;

  function autoAllocate() {
    let left = amountNum;
    const next: Record<string, string> = {};
    for (const i of invoices) {
      if (left <= 0) break;
      const take = round2(Math.min(left, balance(i)));
      next[i.id] = String(take);
      left = round2(left - take);
    }
    setAlloc(next);
  }

  async function submit() {
    if (!partner) return toast.error(t("partnerRequired"));
    if (!(amountNum > 0)) return toast.error(t("amountRequired"));
    if (allocated > amountNum + 0.001) return toast.error(t("overAllocated"));
    setSaving(true);
    try {
      const p = await api<PaymentSummary>("/payments", {
        method: "POST",
        body: {
          kind,
          partnerId: partner.id,
          paymentDate: date,
          method,
          accountId,
          amount: round2(amountNum),
          reference: reference || null,
          chequeNo: method === "cheque" ? chequeNo : null,
          chequeDate: method === "cheque" ? chequeDate : null,
          allocations: Object.entries(alloc)
            .filter(([, v]) => Number(v) > 0)
            .map(([invoiceId, v]) => ({ invoiceId, amount: round2(Number(v)) })),
        },
      });
      toast.success(t(kind === "receipt" ? "savedReceipt" : "savedPayment", { number: p.number }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["invoices"] }),
        qc.invalidateQueries({ queryKey: ["payments"] }),
        qc.invalidateQueries({ queryKey: ["finance"] }),
      ]);
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
        title={t(kind === "receipt" ? "titleReceipt" : "titlePayment")}
        description={partner?.name}
        closeLabel={tc("close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={submit} loading={saving}>
              {t(kind === "receipt" ? "submitReceipt" : "submitPayment")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {!fixedPartner && (
            <Field label={t(kind === "receipt" ? "customer" : "supplier")} htmlFor="p-partner">
              <PartnerPicker
                id="p-partner"
                type={kind === "receipt" ? "customer" : "supplier"}
                value={partner as Partner | null}
                onSelect={(p) => (setPartner(p), setAlloc({}))}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("amount")} htmlFor="p-amount">
              <Input
                id="p-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-lg font-semibold tabular-nums"
              />
            </Field>
            <Field label={t("date")} htmlFor="p-date">
              <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div role="radiogroup" aria-label={t("method")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={
                  method === m
                    ? "border-primary bg-primary/10 text-primary h-9 rounded-lg border text-sm font-medium"
                    : "bg-card text-muted-foreground hover:text-foreground h-9 rounded-lg border text-sm"
                }
              >
                {tm(m)}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("account")} htmlFor="p-account">
              <NativeSelect id="p-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("reference")} htmlFor="p-ref" optional={tc("optional")}>
              <Input id="p-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
            </Field>
            {method === "cheque" && (
              <>
                <Field label={t("chequeNo")} htmlFor="p-chq">
                  <Input id="p-chq" value={chequeNo} maxLength={30} onChange={(e) => setChequeNo(e.target.value)} />
                </Field>
                <Field label={t("chequeDate")} htmlFor="p-chqd">
                  <Input id="p-chqd" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                </Field>
              </>
            )}
          </div>

          {partner && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("allocate")}</span>
                <Button type="button" variant="ghost" size="sm" onClick={autoAllocate} disabled={!amountNum || invoices.length === 0}>
                  <Wand2 /> {t("auto")}
                </Button>
              </div>
              {invoices.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">{openInvoices.isPending ? "…" : t("noOpen")}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {invoices.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm font-medium">{i.number}</p>
                        <p className="text-muted-foreground text-xs">
                          {t("dueOn", { date: f.date(i.dueDate) })} · {t("open", { amount: f.money(balance(i)) })}
                        </p>
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        max={balance(i)}
                        aria-label={t("allocateTo", { number: i.number })}
                        className="h-8 w-32 text-right tabular-nums"
                        value={alloc[i.id] ?? ""}
                        onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <p className={allocated > amountNum + 0.001 ? "text-destructive text-right text-xs" : "text-muted-foreground text-right text-xs"}>
                {t("allocated", { allocated: f.money(allocated), unallocated: f.money(Math.max(0, amountNum - allocated)) })}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
