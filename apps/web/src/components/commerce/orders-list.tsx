"use client";

import { ORDER_STATUSES } from "@stockflow/schemas";
import { ClipboardList, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/data/list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import type { OrderKind, OrderSummary } from "@/lib/types";
import { orderPath } from "./paths";
import { OrderStatusBadge, isOverdue } from "./status";
import { ListSkeleton, PAGE_SIZE, usePagedList } from "./ui";

export const newOrderPath = (kind: OrderKind) =>
  kind === "purchase" ? "/purchasing/orders/new" : kind === "quotation" ? "/sales/quotations/new" : "/sales/orders/new";

export function OrdersList({ kind }: { kind: OrderKind }) {
  const t = useTranslations("commerce.orders");
  const ts = useTranslations("commerce.orderStatus");
  const f = useFormat();
  const can = useCan();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const { query, search, setSearch, page, setPage } = usePagedList<OrderSummary>("/orders", "orders", {
    kind,
    status: status === "overdue" ? undefined : status,
    overdue: status === "overdue" ? "true" : undefined,
  });
  const canCreate = can(kind === "purchase" ? "purchasing.manage" : "sales.manage");

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
            ...ORDER_STATUSES.map((s) => ({ value: s, label: ts(s) })),
            ...(kind !== "quotation" ? [{ value: "overdue", label: ts("overdue") }] : []),
          ]}
        />
      </Toolbar>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.data?.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t(`empty.${kind}`)}
          body={t("emptyBody")}
          action={
            canCreate && (
              <Button size="sm" asChild>
                <Link href={newOrderPath(kind)}>
                  <Plus /> {t(`new.${kind}`)}
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
              <TH>{t(kind === "purchase" ? "cols.supplier" : "cols.customer")}</TH>
              <TH className="hidden md:table-cell">{t("cols.date")}</TH>
              <TH className="hidden lg:table-cell">{t(kind === "quotation" ? "cols.validUntil" : "cols.expected")}</TH>
              <TH className="text-right">{t("cols.total")}</TH>
              <TH>{t("cols.status")}</TH>
            </TR>
          </THead>
          <TBody>
            {query.data?.items.map((o) => (
              <TR key={o.id} className="cursor-pointer" onClick={() => router.push(orderPath(kind, o.id))}>
                <TD>
                  <span className="font-mono text-sm font-medium">{o.number}</span>
                  {o.reference && <span className="text-muted-foreground block truncate text-xs">{o.reference}</span>}
                </TD>
                <TD className="max-w-48 truncate text-sm">{o.partner.name}</TD>
                <TD className="text-muted-foreground hidden whitespace-nowrap text-sm md:table-cell">{f.date(o.orderDate)}</TD>
                <TD className="text-muted-foreground hidden whitespace-nowrap text-sm lg:table-cell">{o.expectedDate ? f.date(o.expectedDate) : "—"}</TD>
                <TD className="text-right font-medium tabular-nums">{f.money(o.total)}</TD>
                <TD>
                  <OrderStatusBadge status={o.status} overdue={kind !== "quotation" && isOverdue(o.status, o.expectedDate)} />
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
