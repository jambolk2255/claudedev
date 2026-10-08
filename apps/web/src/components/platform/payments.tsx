"use client";

import { PLATFORM_INVOICE_STATUSES } from "@stockflow/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Wallet, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ListSkeleton, PAGE_SIZE, usePagedList } from "@/components/commerce/ui";
import { EmptyState, FilterSelect, Pagination, Toolbar } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";

interface InvoiceRow {
  id: string;
  number: string;
  amount: string;
  currency: string;
  status: "pending" | "paid" | "cancelled" | "failed";
  method: "payhere" | "bank_transfer" | "manual";
  interval: "month" | "year";
  reference: string | null;
  createdAt: string;
  paidAt: string | null;
  organization: { id: string; name: string };
  plan: { code: string; name: string };
}

export function PlatformInvoiceBadge({ status }: { status: InvoiceRow["status"] }) {
  const t = useTranslations("billing.invoiceStatus");
  return <Badge variant={status === "paid" ? "success" : status === "pending" ? "warning" : "secondary"}>{t(status)}</Badge>;
}

export function PlatformPayments() {
  const t = useTranslations("platform.payments");
  const tb = useTranslations("billing");
  const f = useFormat();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("pending");
  const { query, page, setPage } = usePagedList<InvoiceRow>("/platform/invoices", "platform", { status: status || undefined });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "mark-paid" | "cancel" }) => api(`/platform/invoices/${id}/${action}`, { method: "POST", body: {} }),
    onSuccess: (_, v) => {
      toast.success(t(v.action === "mark-paid" ? "markedPaid" : "cancelled"));
      void qc.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e) => handleFormError(e),
  });

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <FilterSelect
          label={t("status")}
          value={status}
          onChange={setStatus}
          options={[{ value: "", label: t("all") }, ...PLATFORM_INVOICE_STATUSES.map((s) => ({ value: s, label: tb(`invoiceStatus.${s}`) }))]}
        />
      </Toolbar>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.data?.items.length === 0 ? (
        <EmptyState icon={Wallet} title={t("empty")} />
      ) : (
        <Table className={query.isPlaceholderData ? "opacity-60" : undefined}>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.number")}</TH>
              <TH>{t("cols.company")}</TH>
              <TH className="hidden md:table-cell">{t("cols.plan")}</TH>
              <TH className="hidden lg:table-cell">{t("cols.reference")}</TH>
              <TH className="text-right">{t("cols.amount")}</TH>
              <TH>{t("cols.status")}</TH>
              <TH className="w-px" />
            </TR>
          </THead>
          <TBody>
            {query.data?.items.map((i) => (
              <TR key={i.id}>
                <TD>
                  <span className="font-mono text-sm">{i.number}</span>
                  <span className="text-muted-foreground block text-xs">{f.dateTime(i.createdAt)}</span>
                </TD>
                <TD className="text-sm font-medium">{i.organization.name}</TD>
                <TD className="hidden text-sm md:table-cell">
                  {i.plan.name} · {tb(i.interval === "year" ? "yearly" : "monthly")}
                  <span className="text-muted-foreground block text-xs">{tb(`methods.${i.method}`)}</span>
                </TD>
                <TD className="text-muted-foreground hidden max-w-56 truncate text-sm lg:table-cell">{i.reference ?? "—"}</TD>
                <TD className="text-right font-medium tabular-nums">{f.money(i.amount)}</TD>
                <TD>
                  <PlatformInvoiceBadge status={i.status} />
                </TD>
                <TD>
                  {i.status === "pending" && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("markPaid")}
                        title={t("markPaid")}
                        disabled={act.isPending}
                        onClick={() =>
                          window.confirm(t("confirmPaid", { number: i.number, company: i.organization.name })) && act.mutate({ id: i.id, action: "mark-paid" })
                        }
                      >
                        <CheckCircle2 className="text-success" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("cancel")}
                        title={t("cancel")}
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: i.id, action: "cancel" })}
                      >
                        <XCircle className="text-destructive" />
                      </Button>
                    </div>
                  )}
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
