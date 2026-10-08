"use client";

import { FileText, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/data/list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import type { InvoiceSummary } from "@/lib/types";
import { invoicePath } from "./paths";
import { InvoiceStatusBadge } from "./status";
import { ListSkeleton, PAGE_SIZE, usePagedList } from "./ui";

export function InvoicesList({ kind }: { kind: "sales" | "purchase" }) {
  const t = useTranslations("commerce.invoices");
  const ts = useTranslations("commerce.invoiceStatus");
  const f = useFormat();
  const can = useCan();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const { query, search, setSearch, page, setPage } = usePagedList<InvoiceSummary>("/invoices", "invoices", {
    kind,
    status: status === "overdue" ? undefined : status,
    overdue: status === "overdue" ? "true" : undefined,
  });
  const sales = kind === "sales";

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t("search")} className="min-w-56 flex-1" />
        <FilterSelect
          label={t("status")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: t("allStatuses") },
            ...(["open", "partially_paid", "paid", "overdue"] as const).map((s) => ({ value: s, label: ts(s) })),
          ]}
        />
      </Toolbar>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.data?.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t(sales ? "emptyInvoices" : "emptyBills")}
          body={t(sales ? "emptyInvoicesBody" : "emptyBillsBody")}
          action={
            can(sales ? "sales.manage" : "purchasing.manage") && (
              <Button size="sm" asChild>
                <Link href={sales ? "/sales/invoices/new" : "/purchasing/bills/new"}>
                  <Plus /> {t(sales ? "newInvoice" : "newBill")}
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <Table className={query.isPlaceholderData ? "opacity-60" : undefined}>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.number")}</TH>
              <TH>{t(sales ? "cols.customer" : "cols.supplier")}</TH>
              <TH className="hidden md:table-cell">{t("cols.date")}</TH>
              <TH className="hidden md:table-cell">{t("cols.due")}</TH>
              <TH className="text-right">{t("cols.total")}</TH>
              <TH className="hidden text-right sm:table-cell">{t("cols.balance")}</TH>
              <TH>{t("cols.status")}</TH>
            </TR>
          </THead>
          <TBody>
            {query.data?.items.map((i) => (
              <TR key={i.id} className="cursor-pointer" onClick={() => router.push(invoicePath(kind, i.id))}>
                <TD>
                  <span className="font-mono text-sm font-medium">{i.number}</span>
                  {(i.supplierRef || i.order) && <span className="text-muted-foreground block truncate text-xs">{i.supplierRef ?? i.order?.number}</span>}
                </TD>
                <TD className="max-w-48 truncate text-sm">{i.partner.name}</TD>
                <TD className="text-muted-foreground hidden whitespace-nowrap text-sm md:table-cell">{f.date(i.invoiceDate)}</TD>
                <TD className="text-muted-foreground hidden whitespace-nowrap text-sm md:table-cell">{f.date(i.dueDate)}</TD>
                <TD className="text-right tabular-nums">{f.money(i.total)}</TD>
                <TD className="hidden text-right font-medium tabular-nums sm:table-cell">{f.money(Number(i.total) - Number(i.amountPaid))}</TD>
                <TD>
                  <InvoiceStatusBadge status={i.status} dueDate={i.dueDate} />
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
