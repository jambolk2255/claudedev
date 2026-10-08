"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState, Pagination } from "@/components/data/list";
import { ProductPicker } from "@/components/inventory/product-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan, useMe } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Dec, InvoiceDetail, NoteSummary, Partner, ProductListItem, Warehouse } from "@/lib/types";
import { PartnerPicker } from "./partner-picker";
import { invoicePath, notePath } from "./paths";
import { BackLink, ListSkeleton, MetaGrid, PAGE_SIZE, todayIso, usePagedList } from "./ui";

interface NoteDetail extends Omit<NoteSummary, "partner"> {
  partner: Partner;
  lines: {
    id: string;
    lineNo: number;
    quantity: Dec;
    unitPrice: Dec;
    taxRate: Dec;
    subtotal: Dec;
    tax: Dec;
    total: Dec;
    product: { id: string; sku: string; name: string } | null;
  }[];
  allocations: { id: string; amount: Dec; invoice: { id: string; number: string } }[];
}

type ReturnLine = {
  key: number;
  product: Pick<ProductListItem, "id" | "sku" | "name"> | null;
  quantity: string;
  unitPrice: string;
  batchNo: string;
  max?: number;
};
let seq = 0;

/** Return outward (to supplier → debit note) or inward (from customer → credit note). */
export function ReturnForm({ kind, invoiceId }: { kind: "outward" | "inward"; invoiceId?: string }) {
  const t = useTranslations("commerce.returnForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const qc = useQueryClient();
  const inward = kind === "inward";
  const invoice = useQuery({ queryKey: ["invoices", "detail", invoiceId], queryFn: () => api<InvoiceDetail>(`/invoices/${invoiceId}`), enabled: !!invoiceId });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });
  const active = (warehouses.data ?? []).filter((w) => w.active);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>(invoiceId ? [] : [{ key: ++seq, product: null, quantity: "1", unitPrice: "", batchNo: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!warehouseId && active.length) setWarehouseId((active.find((w) => w.isDefault) ?? active[0])!.id);
  }, [active, warehouseId]);
  useEffect(() => {
    const inv = invoice.data;
    if (!inv) return;
    setPartner(inv.partner);
    setLines(
      inv.lines
        .filter((l) => l.product)
        .map((l) => ({
          key: ++seq,
          product: l.product!,
          quantity: "0",
          unitPrice: String(Number(l.unitPrice) * (1 - Number(l.discountPct) / 100)),
          batchNo: "",
          max: Number(l.quantity),
        })),
    );
  }, [invoice.data]);

  const update = (key: number, patch: Partial<ReturnLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function submit() {
    if (!partner) return toast.error(t("partnerRequired"));
    const filled = lines.filter((l) => l.product && Number(l.quantity) > 0);
    if (filled.length === 0) return toast.error(t("noLines"));
    setSaving(true);
    try {
      const note = await api<NoteSummary>("/returns", {
        method: "POST",
        body: {
          kind,
          partnerId: partner.id,
          warehouseId,
          invoiceId: invoiceId ?? null,
          documentDate: date,
          reason: reason || null,
          lines: filled.map((l) => ({
            productId: l.product!.id,
            quantity: Number(l.quantity),
            ...(l.unitPrice !== "" ? { unitPrice: Math.round(Number(l.unitPrice) * 10000) / 10000 } : {}),
            batchNo: l.batchNo || null,
          })),
        },
      });
      await Promise.all(["notes", "invoices", "stock", "products"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.success(t(inward ? "createdCredit" : "createdDebit", { number: note.number }));
      router.push(notePath(inward ? "credit" : "debit", note.id));
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  if (invoiceId && invoice.isPending) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-5">
      <p className="text-muted-foreground text-sm">{t(inward ? "introInward" : "introOutward")}</p>
      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t(inward ? "customer" : "supplier")} htmlFor="r-partner" className="sm:col-span-2">
          {invoice.data ? (
            <Input id="r-partner" value={`${invoice.data.partner.name} · ${invoice.data.number}`} disabled />
          ) : (
            <PartnerPicker id="r-partner" type={inward ? "customer" : "supplier"} value={partner} onSelect={setPartner} />
          )}
        </Field>
        <Field label={t(inward ? "receiveInto" : "returnFrom")} htmlFor="r-wh">
          <NativeSelect id="r-wh" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("date")} htmlFor="r-date">
          <Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("reason")} htmlFor="r-reason" optional={tc("optional")} className="sm:col-span-2 lg:col-span-4">
          <Input id="r-reason" value={reason} maxLength={300} placeholder={t("reasonPlaceholder")} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.product")}</TH>
              <TH className="w-32 text-right">{t("cols.qty")}</TH>
              <TH className="w-36 text-right">{t("cols.unitValue")}</TH>
              <TH className="hidden w-32 sm:table-cell">{t("cols.batch")}</TH>
              {!invoiceId && <TH className="w-px" />}
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => (
              <TR key={l.key} className="hover:bg-transparent">
                <TD>
                  {invoiceId ? (
                    <>
                      <span className="font-medium">{l.product?.name}</span>
                      <span className="text-muted-foreground block font-mono text-xs">
                        {l.product?.sku} · {t("invoiced", { qty: l.max ?? 0 })}
                      </span>
                    </>
                  ) : (
                    <ProductPicker
                      value={l.product as ProductListItem | null}
                      onSelect={(p) => update(l.key, { product: p, unitPrice: String(Number(inward ? p.sellPrice : p.costPrice)) })}
                    />
                  )}
                </TD>
                <TD>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={l.max}
                    step="any"
                    className="h-8 text-right tabular-nums"
                    aria-label={t("cols.qty")}
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                  />
                </TD>
                <TD>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="h-8 text-right tabular-nums"
                    aria-label={t("cols.unitValue")}
                    value={l.unitPrice}
                    onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                  />
                </TD>
                <TD className="hidden sm:table-cell">
                  <Input
                    className="h-8"
                    aria-label={t("cols.batch")}
                    maxLength={50}
                    value={l.batchNo}
                    onChange={(e) => update(l.key, { batchNo: e.target.value })}
                  />
                </TD>
                {!invoiceId && (
                  <TD>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={tc("remove")}
                      disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 />
                    </Button>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
        {!invoiceId && (
          <div className="border-t p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLines((ls) => [...ls, { key: ++seq, product: null, quantity: "1", unitPrice: "", batchNo: "" }])}
            >
              <Plus /> {t("addLine")}
            </Button>
          </div>
        )}
      </Card>
      <p className="text-muted-foreground -mt-2 text-xs">{t("taxHint")}</p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          {tc("cancel")}
        </Button>
        <Button onClick={submit} loading={saving}>
          {!saving && <Undo2 />} {t(inward ? "submitInward" : "submitOutward")}
        </Button>
      </div>
    </div>
  );
}

export function NotesList({ kind }: { kind: "credit" | "debit" }) {
  const t = useTranslations("commerce.notes");
  const f = useFormat();
  const router = useRouter();
  const { query, page, setPage } = usePagedList<NoteSummary>("/notes", "notes", { kind });
  return (
    <Card className="overflow-hidden">
      {query.isPending ? (
        <ListSkeleton />
      ) : query.data?.items.length === 0 ? (
        <EmptyState
          icon={Undo2}
          title={t(kind === "credit" ? "emptyCredit" : "emptyDebit")}
          body={t(kind === "credit" ? "emptyCreditBody" : "emptyDebitBody")}
        />
      ) : (
        <Table className={query.isPlaceholderData ? "opacity-60" : undefined}>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.number")}</TH>
              <TH>{t("cols.partner")}</TH>
              <TH className="hidden md:table-cell">{t("cols.date")}</TH>
              <TH className="hidden lg:table-cell">{t("cols.invoice")}</TH>
              <TH className="text-right">{t("cols.total")}</TH>
              <TH>{t("cols.status")}</TH>
            </TR>
          </THead>
          <TBody>
            {query.data?.items.map((n) => (
              <TR key={n.id} className="cursor-pointer" onClick={() => router.push(notePath(kind, n.id))}>
                <TD>
                  <span className="font-mono text-sm font-medium">{n.number}</span>
                  {n.reason && <span className="text-muted-foreground block max-w-56 truncate text-xs">{n.reason}</span>}
                </TD>
                <TD className="max-w-48 truncate text-sm">{n.partner.name}</TD>
                <TD className="text-muted-foreground hidden whitespace-nowrap text-sm md:table-cell">{f.date(n.noteDate)}</TD>
                <TD className="hidden font-mono text-sm lg:table-cell">{n.invoice?.number ?? "—"}</TD>
                <TD className="text-right font-medium tabular-nums">{f.money(n.total)}</TD>
                <TD>
                  <Badge variant={n.status === "applied" ? "success" : "warning"}>{t(n.status)}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {query.data && query.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPage={setPage} />}
    </Card>
  );
}

export function NoteDetailView({ id, kind }: { id: string; kind: "credit" | "debit" }) {
  const t = useTranslations("commerce.notes");
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const note = useQuery({ queryKey: ["notes", "detail", id], queryFn: () => api<NoteDetail>(`/notes/${id}`) });
  const credit = kind === "credit";
  const n = note.data;
  const unapplied = n ? Math.round((Number(n.total) - Number(n.amountApplied)) * 100) / 100 : 0;
  const openInvoices = useQuery({
    queryKey: ["invoices", "open", credit ? "sales" : "purchase", n?.partner.id],
    enabled: !!n && unapplied > 0,
    queryFn: async () => {
      const get = (s: string) =>
        api<{ items: { id: string; number: string; total: Dec; amountPaid: Dec }[] }>(
          `/invoices?kind=${credit ? "sales" : "purchase"}&partnerId=${n!.partner.id}&status=${s}&pageSize=100`,
        );
      const [a, b] = await Promise.all([get("open"), get("partially_paid")]);
      return [...a.items, ...b.items];
    },
  });
  const [target, setTarget] = useState("");
  const apply = useMutation({
    mutationFn: () => {
      const inv = openInvoices.data!.find((i) => i.id === target)!;
      const amount = Math.min(unapplied, Math.round((Number(inv.total) - Number(inv.amountPaid)) * 100) / 100);
      return api<NoteDetail>(`/notes/${id}/apply`, { method: "POST", body: { invoiceId: target, amount } });
    },
    onSuccess: (d) => {
      qc.setQueryData(["notes", "detail", id], d);
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      setTarget("");
      toast.success(t("appliedToast"));
    },
    onError: (e) => handleFormError(e),
  });

  if (note.isPending) return <Skeleton className="h-96" />;
  if (!n) return null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <BackLink href={credit ? "/sales/returns" : "/purchasing/returns"} label={t("back")} />
          <p className="text-muted-foreground hidden text-sm print:block">{me?.organization.name}</p>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {t(credit ? "creditNote" : "debitNote")} <span className="font-mono">{n.number}</span>
            <Badge variant={n.status === "applied" ? "success" : "warning"}>{t(n.status)}</Badge>
          </h2>
        </div>
        <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          <Printer /> {t("print")}
        </Button>
      </div>
      <MetaGrid
        items={[
          { label: t(credit ? "customer" : "supplier"), value: n.partner.name },
          { label: t("cols.date"), value: f.date(n.noteDate) },
          ...(n.invoice
            ? [
                {
                  label: t("cols.invoice"),
                  value: (
                    <Link href={invoicePath(credit ? "sales" : "purchase", n.invoice.id)} className="font-mono hover:underline">
                      {n.invoice.number}
                    </Link>
                  ),
                },
              ]
            : []),
          ...(n.stockDocument
            ? [
                {
                  label: t("stockDoc"),
                  value: (
                    <Link href={`/inventory/documents/${n.stockDocument.id}`} className="font-mono hover:underline">
                      {n.stockDocument.number}
                    </Link>
                  ),
                },
              ]
            : []),
          ...(n.reason ? [{ label: t("reason"), value: n.reason, wide: true }] : []),
        ]}
      />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.product")}</TH>
              <TH className="text-right">{t("cols.qty")}</TH>
              <TH className="text-right">{t("cols.unitValue")}</TH>
              <TH className="hidden text-right sm:table-cell">{t("cols.tax")}</TH>
              <TH className="text-right">{t("cols.total")}</TH>
            </TR>
          </THead>
          <TBody>
            {n.lines.map((l) => (
              <TR key={l.id}>
                <TD>
                  <span className="font-medium">{l.product?.name}</span>
                  <span className="text-muted-foreground block font-mono text-xs">{l.product?.sku}</span>
                </TD>
                <TD className="text-right tabular-nums">{f.qty(l.quantity)}</TD>
                <TD className="text-right tabular-nums">{f.money(l.unitPrice)}</TD>
                <TD className="hidden text-right tabular-nums sm:table-cell">{f.money(l.tax)}</TD>
                <TD className="text-right font-medium tabular-nums">{f.money(l.total)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="grid justify-end gap-1 border-t px-5 py-4 text-sm">
          <div className="flex justify-between gap-8">
            <span className="text-muted-foreground">{t("subtotal")}</span>
            <span className="tabular-nums">{f.money(n.subtotal)}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className="text-muted-foreground">{t("tax")}</span>
            <span className="tabular-nums">{f.money(n.taxTotal)}</span>
          </div>
          <div className="flex justify-between gap-8 border-t pt-1 text-base font-semibold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{f.money(n.total)}</span>
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden print:hidden">
        <CardHeader className="pb-3">
          <CardTitle>{t("applications")}</CardTitle>
        </CardHeader>
        <ul className="divide-y border-t">
          {n.allocations.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <Link href={invoicePath(credit ? "sales" : "purchase", a.invoice.id)} className="font-mono font-medium hover:underline">
                {a.invoice.number}
              </Link>
              <span className="tabular-nums">{f.money(a.amount)}</span>
            </li>
          ))}
          {unapplied > 0 && (
            <li className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="text-muted-foreground">{t("unapplied", { amount: f.money(unapplied) })}</span>
              {can("finance.manage") && (openInvoices.data?.length ?? 0) > 0 && (
                <div className="ml-auto flex gap-2">
                  <NativeSelect className="h-8 w-56" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t("applyTo")}>
                    <option value="">{t("applyTo")}</option>
                    {openInvoices.data!.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.number} · {f.money(Number(i.total) - Number(i.amountPaid))}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button size="sm" disabled={!target} loading={apply.isPending} onClick={() => apply.mutate()}>
                    {t("apply")}
                  </Button>
                </div>
              )}
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
