"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, CheckCheck, CircleDot, Copy, FileText, Link2, PackageCheck, Pencil, Printer, Receipt, Repeat, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan, useMe } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { OrderDetail as Order, OrderKind } from "@/lib/types";
import { FulfilSheet } from "./fulfil-sheet";
import { Totals } from "./lines-editor";
import { invoicePath, orderPath, ordersListPath } from "./paths";
import { InvoiceStatusBadge, OrderStatusBadge, isOverdue } from "./status";
import { BackLink, MetaGrid, Progress } from "./ui";

export function OrderDetail({ id, kind }: { id: string; kind: OrderKind }) {
  const t = useTranslations("commerce.order");
  const tk = useTranslations("commerce.kinds");
  const tc = useTranslations("common");
  const f = useFormat();
  const can = useCan();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [fulfilOpen, setFulfilOpen] = useState(false);
  const order = useQuery({ queryKey: ["orders", "detail", id], queryFn: () => api<Order>(`/orders/${id}`) });

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      api<{ id: string; number: string; kind: OrderKind }>(`/orders/${id}/${path}`, { method: "POST", body: body ?? {} }),
    onSuccess: async (res, { path }) => {
      await qc.invalidateQueries({ queryKey: ["orders"] });
      if (path === "convert") {
        toast.success(t("converted", { number: res.number }));
        router.push(orderPath("sales", res.id));
      } else toast.success(t(`done.${path}` as "done.confirm"));
    },
    onError: (err, vars) => {
      if (err instanceof ApiError && err.code === "CREDIT_LIMIT" && can("sales.approve") && vars.path === "confirm") {
        toast.error(err.message, { action: { label: t("override"), onClick: () => action.mutate({ path: "confirm", body: { overrideCreditLimit: true } }) } });
      } else handleFormError(err);
    },
  });

  if (order.isPending) return <Skeleton className="h-96" />;
  if (!order.data) return null;
  const o = order.data;
  const purchase = o.kind === "purchase";
  const perms = purchase
    ? { manage: "purchasing.manage", approve: "purchasing.approve", fulfil: "purchasing.receive" }
    : { manage: "sales.manage", approve: "sales.approve", fulfil: "sales.dispatch" };
  const open = o.status === "confirmed" || o.status === "partial";
  const canFulfil =
    o.kind !== "quotation" &&
    open &&
    can(perms.fulfil as "sales.dispatch") &&
    o.lines.some((l) => l.product.type === "stock" && Number(l.quantity) > Number(l.fulfilledQty));
  const toInvoice = o.lines.some(
    (l) => Number(l.quantity) > Number(l.invoicedQty) && (!purchase || l.product.type !== "stock" || Number(l.fulfilledQty) > Number(l.invoicedQty)),
  );
  const canInvoice = o.kind !== "quotation" && ["confirmed", "partial", "fulfilled"].includes(o.status) && toInvoice && can(perms.manage as "sales.manage");
  const nothingDone = o.lines.every((l) => Number(l.fulfilledQty) === 0 && Number(l.invoicedQty) === 0);
  const trackingUrl = o.trackingToken && typeof window !== "undefined" ? `${window.location.origin}/track/${o.trackingToken}` : null;
  const busy = action.isPending;

  const timeline = [
    { at: o.createdAt, icon: CircleDot, label: t("timeline.created"), href: undefined as string | undefined },
    ...(o.approvedAt ? [{ at: o.approvedAt, icon: Check, label: t("timeline.confirmed"), href: undefined }] : []),
    ...o.stockDocuments.map((d) => ({
      at: d.createdAt,
      icon: d.type === "grn" ? PackageCheck : Truck,
      label: t(`timeline.${d.type === "grn" ? "received" : "delivered"}`, { number: d.number }),
      href: `/inventory/documents/${d.id}`,
    })),
    ...o.invoices.map((i) => ({
      at: i.createdAt,
      icon: Receipt,
      label: t(purchase ? "timeline.billed" : "timeline.invoiced", { number: i.number }),
      href: invoicePath(purchase ? "purchase" : "sales", i.id),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="grid gap-6 print:gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid gap-1">
          <BackLink href={ordersListPath(o.kind)} label={t("back")} />
          <p className="text-muted-foreground hidden text-sm print:block">{me?.organization.name}</p>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {tk(o.kind)} <span className="font-mono">{o.number}</span>
            <OrderStatusBadge status={o.status} overdue={o.kind !== "quotation" && isOverdue(o.status, o.expectedDate)} />
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> {t("print")}
          </Button>
          {trackingUrl && (
            <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(trackingUrl).then(() => toast.success(t("linkCopied")))}>
              <Link2 /> {t("copyTracking")}
            </Button>
          )}
          {o.status === "draft" && can(perms.manage as "sales.manage") && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`${orderPath(o.kind, o.id)}/edit`}>
                <Pencil /> {tc("edit")}
              </Link>
            </Button>
          )}
          {(o.status === "draft" || o.status === "confirmed") && nothingDone && can(perms.manage as "sales.manage") && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => action.mutate({ path: "cancel" })}>
              <Ban /> {t("cancel")}
            </Button>
          )}
          {(o.status === "confirmed" || o.status === "partial" || o.status === "fulfilled") &&
            o.kind !== "quotation" &&
            can(perms.manage as "sales.manage") && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => action.mutate({ path: "close" })}>
                <CheckCheck /> {t("close")}
              </Button>
            )}
          {o.kind === "quotation" && (o.status === "draft" || o.status === "confirmed") && can("sales.manage") && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => action.mutate({ path: "convert" })}>
              <Repeat /> {t("convert")}
            </Button>
          )}
          {o.status === "draft" && (can(perms.approve as "sales.approve") || can(perms.manage as "sales.manage")) && (
            <Button size="sm" loading={busy && action.variables?.path === "confirm"} disabled={busy} onClick={() => action.mutate({ path: "confirm" })}>
              <Check /> {t(o.kind === "quotation" ? "send" : "confirm")}
            </Button>
          )}
          {canFulfil && (
            <Button size="sm" variant={canInvoice ? "outline" : "default"} onClick={() => setFulfilOpen(true)}>
              {purchase ? <PackageCheck /> : <Truck />} {t(purchase ? "receive" : "deliver")}
            </Button>
          )}
          {canInvoice && (
            <Button size="sm" asChild>
              <Link href={`${purchase ? "/purchasing/bills/new" : "/sales/invoices/new"}?order=${o.id}`}>
                <FileText /> {t(purchase ? "bill" : "invoice")}
              </Link>
            </Button>
          )}
          {!purchase && o.kind === "sales" && o.invoices.length > 0 && can("sales.manage") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label={t("more")}>
                  <Copy />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {o.invoices.map((i) => (
                  <DropdownMenuItem key={i.id} asChild>
                    <Link href={`/sales/returns/new?invoice=${i.id}`}>{t("returnFrom", { number: i.number })}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <MetaGrid
        items={[
          {
            label: t(purchase ? "supplier" : "customer"),
            value: (
              <Link href={`/contacts/${purchase ? "suppliers" : "customers"}?id=${o.partner.id}`} className="hover:underline">
                {o.partner.name}
              </Link>
            ),
          },
          { label: t(purchase ? "receiveInto" : "shipFrom"), value: `${o.warehouse.name} (${o.warehouse.code})` },
          { label: t("date"), value: f.date(o.orderDate) },
          { label: t(o.kind === "quotation" ? "validUntil" : "expected"), value: o.expectedDate ? f.date(o.expectedDate) : "—" },
          ...(o.reference ? [{ label: t("reference"), value: o.reference }] : []),
          ...(o.deliveryAddress ? [{ label: t("deliveryAddress"), value: o.deliveryAddress, wide: true }] : []),
          ...(o.convertedFrom
            ? [
                {
                  label: t("fromQuotation"),
                  value: (
                    <Link href={orderPath("quotation", o.convertedFrom.id)} className="font-mono hover:underline">
                      {o.convertedFrom.number}
                    </Link>
                  ),
                },
              ]
            : []),
          ...(o.convertedTo.length
            ? [
                {
                  label: t("salesOrder"),
                  value: o.convertedTo.map((c) => (
                    <Link key={c.id} href={orderPath("sales", c.id)} className="font-mono hover:underline">
                      {c.number}
                    </Link>
                  )),
                },
              ]
            : []),
        ]}
      />

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>{t("items")}</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.product")}</TH>
              <TH className="text-right">{t("cols.qty")}</TH>
              <TH className="hidden text-right sm:table-cell">{t("cols.price")}</TH>
              <TH className="hidden text-right md:table-cell">{t("cols.discount")}</TH>
              <TH className="hidden text-right md:table-cell">{t("cols.tax")}</TH>
              <TH className="text-right">{t("cols.total")}</TH>
              {o.kind !== "quotation" && o.status !== "draft" && <TH className="w-44 print:hidden">{t("cols.progress")}</TH>}
            </TR>
          </THead>
          <TBody>
            {o.lines.map((l) => {
              const qty = Number(l.quantity);
              return (
                <TR key={l.id}>
                  <TD>
                    <span className="font-medium">{l.product.name}</span>
                    <span className="text-muted-foreground block font-mono text-xs">{l.product.sku}</span>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {f.qty(qty)} <span className="text-muted-foreground text-xs">{l.product.unit?.code}</span>
                  </TD>
                  <TD className="hidden text-right tabular-nums sm:table-cell">{f.money(l.unitPrice)}</TD>
                  <TD className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                    {Number(l.discountPct) ? `${Number(l.discountPct)}%` : "—"}
                  </TD>
                  <TD className="text-muted-foreground hidden text-right tabular-nums md:table-cell">{Number(l.taxRate) ? `${Number(l.taxRate)}%` : "—"}</TD>
                  <TD className="text-right font-medium tabular-nums">{f.money(l.total)}</TD>
                  {o.kind !== "quotation" && o.status !== "draft" && (
                    <TD className="print:hidden">
                      <div className="grid gap-1.5 text-xs">
                        {l.product.type === "stock" && (
                          <div className="grid gap-0.5">
                            <span className="text-muted-foreground flex justify-between">
                              {t(purchase ? "received" : "delivered")}{" "}
                              <span className="tabular-nums">
                                {f.qty(l.fulfilledQty)}/{f.qty(qty)}
                              </span>
                            </span>
                            <Progress value={Number(l.fulfilledQty)} max={qty} />
                          </div>
                        )}
                        <div className="grid gap-0.5">
                          <span className="text-muted-foreground flex justify-between">
                            {t(purchase ? "billed" : "invoiced")}{" "}
                            <span className="tabular-nums">
                              {f.qty(l.invoicedQty)}/{f.qty(qty)}
                            </span>
                          </span>
                          <Progress value={Number(l.invoicedQty)} max={qty} />
                        </div>
                      </div>
                    </TD>
                  )}
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="flex justify-end border-t px-5 py-4">
          <Totals totals={{ subtotal: o.subtotal, discount: o.discountTotal, sscl: o.ssclTotal, tax: o.taxTotal, total: o.total }} />
        </div>
      </Card>

      {o.notes && (
        <Card className="p-5">
          <p className="text-muted-foreground mb-1 text-xs">{t("notes")}</p>
          <p className="whitespace-pre-line text-sm">{o.notes}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        {o.invoices.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle>{t(purchase ? "bills" : "invoices")}</CardTitle>
            </CardHeader>
            <ul className="divide-y border-t">
              {o.invoices.map((i) => (
                <li key={i.id}>
                  <Link
                    href={invoicePath(purchase ? "purchase" : "sales", i.id)}
                    className="hover:bg-muted/50 flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <span className="font-mono font-medium">{i.number}</span>
                    <span className="text-muted-foreground">{f.date(i.invoiceDate)}</span>
                    <span className="ml-auto tabular-nums">{f.money(i.total)}</span>
                    <InvoiceStatusBadge status={i.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="p-5">
          <CardTitle className="mb-4">{t("activity")}</CardTitle>
          <ol className="relative grid gap-4 border-l pl-5">
            {timeline.map((e, i) => (
              <li key={i} className="relative">
                <span className="bg-background text-primary absolute -left-[29px] top-0 grid size-4 place-content-center rounded-full border">
                  <e.icon className="size-2.5" />
                </span>
                {e.href ? (
                  <Link href={e.href} className="text-sm font-medium hover:underline">
                    {e.label}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">{e.label}</p>
                )}
                <p className="text-muted-foreground text-xs">{f.dateTime(e.at)}</p>
              </li>
            ))}
            {o.status === "cancelled" && (
              <li>
                <Badge variant="destructive">{t("timeline.cancelled")}</Badge>
              </li>
            )}
          </ol>
        </Card>
      </div>

      {canFulfil && fulfilOpen && <FulfilSheet order={o} open={fulfilOpen} onOpenChange={setFulfilOpen} />}
    </div>
  );
}
