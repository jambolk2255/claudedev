"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Printer, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan, useMe } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { InvoiceDetail as Invoice } from "@/lib/types";
import { Totals } from "./lines-editor";
import { notePath, orderPath } from "./paths";
import { PaymentSheet } from "./payment-sheet";
import { InvoiceStatusBadge } from "./status";
import { BackLink, MetaGrid, Progress } from "./ui";

export function InvoiceDetail({ id, kind }: { id: string; kind: "sales" | "purchase" }) {
  const t = useTranslations("commerce.invoice");
  const tm = useTranslations("commerce.methods");
  const f = useFormat();
  const can = useCan();
  const { data: me } = useMe();
  const [payOpen, setPayOpen] = useState(false);
  const inv = useQuery({ queryKey: ["invoices", "detail", id], queryFn: () => api<Invoice>(`/invoices/${id}`) });

  if (inv.isPending) return <Skeleton className="h-96" />;
  if (!inv.data) return null;
  const i = inv.data;
  const sales = i.kind === "sales";
  const balance = Math.round((Number(i.total) - Number(i.amountPaid)) * 100) / 100;
  const canPay = balance > 0 && i.status !== "void" && (can("finance.manage") || (sales && can("sales.manage")));
  const canReturn = i.lines.some((l) => l.product) && can(sales ? "sales.manage" : "purchasing.manage");

  return (
    <div className="grid gap-6 print:gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <BackLink href={sales ? "/sales/invoices" : "/purchasing/bills"} label={t(sales ? "backInvoices" : "backBills")} />
          {sales && (
            <div className="hidden print:block">
              <p className="text-lg font-semibold">{me?.organization.name}</p>
            </div>
          )}
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {t(sales ? "invoice" : "bill")} <span className="font-mono">{i.number}</span>
            <InvoiceStatusBadge status={i.status} dueDate={i.dueDate} />
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> {t("print")}
          </Button>
          {canReturn && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`${sales ? "/sales/returns/new" : "/purchasing/returns/new"}?invoice=${i.id}`}>
                <Undo2 /> {t(sales ? "returnInward" : "returnOutward")}
              </Link>
            </Button>
          )}
          {canPay && (
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <Banknote /> {t(sales ? "receive" : "pay")}
            </Button>
          )}
        </div>
      </div>

      <MetaGrid
        items={[
          { label: t(sales ? "customer" : "supplier"), value: i.partner.name },
          { label: t("date"), value: f.date(i.invoiceDate) },
          { label: t("due"), value: f.date(i.dueDate) },
          ...(i.order
            ? [
                {
                  label: t("order"),
                  value: (
                    <Link href={orderPath(sales ? "sales" : "purchase", i.order.id)} className="font-mono hover:underline">
                      {i.order.number}
                    </Link>
                  ),
                },
              ]
            : []),
          ...(i.supplierRef ? [{ label: t("supplierRef"), value: i.supplierRef }] : []),
          ...(i.partner.taxNo ? [{ label: t("taxNo"), value: i.partner.taxNo }] : []),
          ...(i.partner.address ? [{ label: t("address"), value: [i.partner.address, i.partner.city].filter(Boolean).join(", "), wide: true }] : []),
        ]}
      />

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH className="w-10">#</TH>
              <TH>{t("cols.item")}</TH>
              <TH className="text-right">{t("cols.qty")}</TH>
              <TH className="text-right">{t("cols.price")}</TH>
              <TH className="hidden text-right sm:table-cell">{t("cols.discount")}</TH>
              <TH className="hidden text-right sm:table-cell">{t("cols.tax")}</TH>
              <TH className="text-right">{t("cols.amount")}</TH>
            </TR>
          </THead>
          <TBody>
            {i.lines.map((l) => (
              <TR key={l.id}>
                <TD className="text-muted-foreground tabular-nums">{l.lineNo}</TD>
                <TD>
                  <span className="font-medium">{l.product?.name ?? l.description}</span>
                  {l.product && <span className="text-muted-foreground block font-mono text-xs">{l.product.sku}</span>}
                </TD>
                <TD className="text-right tabular-nums">
                  {f.qty(l.quantity)} <span className="text-muted-foreground text-xs">{l.product?.unit?.code}</span>
                </TD>
                <TD className="text-right tabular-nums">{f.money(l.unitPrice)}</TD>
                <TD className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                  {Number(l.discountPct) ? `${Number(l.discountPct)}%` : "—"}
                </TD>
                <TD className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">{Number(l.taxRate) ? `${Number(l.taxRate)}%` : "—"}</TD>
                <TD className="text-right font-medium tabular-nums">{f.money(l.subtotal)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="flex flex-col-reverse gap-6 border-t px-5 py-4 sm:flex-row sm:justify-between">
          <div className="grid max-w-xs content-start gap-2 text-sm print:hidden">
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">{t("paid")}</span>
              <span className="tabular-nums">{f.money(i.amountPaid)}</span>
            </div>
            <Progress value={Number(i.amountPaid)} max={Number(i.total)} />
            <div className="flex justify-between gap-6 font-semibold">
              <span>{t("balance")}</span>
              <span className="tabular-nums">{f.money(balance)}</span>
            </div>
          </div>
          <Totals totals={{ subtotal: i.subtotal, discount: i.discountTotal, sscl: i.ssclTotal, tax: i.taxTotal, total: i.total }} />
        </div>
      </Card>

      {i.notes && (
        <Card className="p-5">
          <p className="text-muted-foreground mb-1 text-xs">{t("notes")}</p>
          <p className="whitespace-pre-line text-sm">{i.notes}</p>
        </Card>
      )}

      <Card className="overflow-hidden print:hidden">
        <CardHeader className="pb-3">
          <CardTitle>{t("settlements")}</CardTitle>
        </CardHeader>
        {i.allocations.length === 0 ? (
          <p className="text-muted-foreground px-5 pb-5 text-sm">{t("noSettlements")}</p>
        ) : (
          <ul className="divide-y border-t">
            {i.allocations.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                {a.payment ? (
                  <>
                    <span className="font-mono font-medium">{a.payment.number}</span>
                    <span className="text-muted-foreground">
                      {tm(a.payment.method as "cash")} · {f.date(a.payment.paymentDate)}
                    </span>
                  </>
                ) : a.note ? (
                  <>
                    <Link href={notePath(sales ? "credit" : "debit", a.note.id)} className="font-mono font-medium hover:underline">
                      {a.note.number}
                    </Link>
                    <span className="text-muted-foreground">
                      {t(sales ? "creditNote" : "debitNote")} · {f.date(a.note.noteDate)}
                    </span>
                  </>
                ) : null}
                <span className="ml-auto font-medium tabular-nums">{f.money(a.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {payOpen && <PaymentSheet kind={sales ? "receipt" : "payment"} partner={i.partner} invoiceId={i.id} open={payOpen} onOpenChange={setPayOpen} />}
    </div>
  );
}
