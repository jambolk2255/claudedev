"use client";

import { PAYMENT_METHODS } from "@stockflow/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, CircleCheck, CircleX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, FilterSelect, Pagination, Toolbar } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { PaymentSummary } from "@/lib/types";
import { ListSkeleton, PAGE_SIZE, usePagedList } from "./ui";

export function ChequeBadge({ p }: { p: Pick<PaymentSummary, "status" | "chequeStatus"> }) {
  const t = useTranslations("commerce.payments");
  if (p.status === "bounced" || p.chequeStatus === "bounced") return <Badge variant="destructive">{t("bounced")}</Badge>;
  if (p.chequeStatus === "pending") return <Badge variant="warning">{t("pending")}</Badge>;
  if (p.chequeStatus === "cleared") return <Badge variant="success">{t("cleared")}</Badge>;
  return <Badge variant="secondary">{t("posted")}</Badge>;
}

/** Receipts, supplier payments, or (kind omitted + chequesOnly) the cheque register. */
export function PaymentsList({ kind, chequesOnly }: { kind?: "receipt" | "payment"; chequesOnly?: boolean }) {
  const t = useTranslations("commerce.payments");
  const tm = useTranslations("commerce.methods");
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const [method, setMethod] = useState(chequesOnly ? "cheque" : "");
  const [chequeStatus, setChequeStatus] = useState(chequesOnly ? "pending" : "");
  const { query, page, setPage } = usePagedList<PaymentSummary>("/payments", "payments", {
    kind,
    method: method || undefined,
    chequeStatus: method === "cheque" ? chequeStatus || undefined : undefined,
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "clear" | "bounce" }) => api(`/payments/${id}/${action}`, { method: "POST" }),
    onSuccess: (_, { action }) => {
      toast.success(t(action === "clear" ? "clearedToast" : "bouncedToast"));
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e) => handleFormError(e),
  });

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        {!chequesOnly && (
          <FilterSelect
            label={t("method")}
            value={method}
            onChange={setMethod}
            options={[{ value: "", label: t("allMethods") }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: tm(m) }))]}
          />
        )}
        {method === "cheque" && (
          <FilterSelect
            label={t("chequeStatus")}
            value={chequeStatus}
            onChange={setChequeStatus}
            options={[
              { value: "", label: t("allCheques") },
              { value: "pending", label: t("pending") },
              { value: "cleared", label: t("cleared") },
              { value: "bounced", label: t("bounced") },
            ]}
          />
        )}
      </Toolbar>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.data?.items.length === 0 ? (
        <EmptyState icon={Banknote} title={t(chequesOnly ? "emptyCheques" : kind === "payment" ? "emptyPayments" : "emptyReceipts")} />
      ) : (
        <Table className={query.isPlaceholderData ? "opacity-60" : undefined}>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.number")}</TH>
              <TH>{t("cols.partner")}</TH>
              <TH className="hidden md:table-cell">{t("cols.date")}</TH>
              <TH className="hidden sm:table-cell">{t("cols.method")}</TH>
              <TH className="text-right">{t("cols.amount")}</TH>
              <TH className="hidden text-right lg:table-cell">{t("cols.unallocated")}</TH>
              <TH>{t("cols.status")}</TH>
              {method === "cheque" && can("finance.manage") && <TH className="w-px" />}
            </TR>
          </THead>
          <TBody>
            {query.data?.items.map((p) => (
              <TR key={p.id}>
                <TD>
                  <span className="font-mono text-sm font-medium">{p.number}</span>
                  {p.reference && <span className="text-muted-foreground block truncate text-xs">{p.reference}</span>}
                </TD>
                <TD className="max-w-48 truncate text-sm">
                  {p.partner.name}
                  {!kind && <span className="text-muted-foreground block text-xs">{t(p.kind)}</span>}
                </TD>
                <TD className="text-muted-foreground hidden whitespace-nowrap text-sm md:table-cell">{f.date(p.paymentDate)}</TD>
                <TD className="hidden text-sm sm:table-cell">
                  {tm(p.method)}
                  {p.chequeNo && (
                    <span className="text-muted-foreground block text-xs">
                      #{p.chequeNo} · {p.chequeDate ? f.date(p.chequeDate) : ""}
                    </span>
                  )}
                </TD>
                <TD className="text-right font-medium tabular-nums">{f.money(p.amount)}</TD>
                <TD className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">{f.money(Number(p.amount) - Number(p.amountAllocated))}</TD>
                <TD>
                  <ChequeBadge p={p} />
                </TD>
                {method === "cheque" && can("finance.manage") && (
                  <TD>
                    {p.chequeStatus === "pending" && p.status === "posted" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("clear")}
                          title={t("clear")}
                          disabled={act.isPending}
                          onClick={() => act.mutate({ id: p.id, action: "clear" })}
                        >
                          <CircleCheck className="text-success" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("bounce")}
                          title={t("bounce")}
                          disabled={act.isPending}
                          onClick={() => window.confirm(t("bounceConfirm", { number: p.number })) && act.mutate({ id: p.id, action: "bounce" })}
                        >
                          <CircleX className="text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {query.data && query.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPage={setPage} />}
    </Card>
  );
}
