"use client";

import { STOCK_DOCUMENT_TYPES, type Paginated } from "@stockflow/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { EmptyState, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounce";
import { useFormat } from "@/hooks/use-format";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { StockDocumentSummary } from "@/lib/types";
import { DOC_ICONS } from "./document-form";

const PAGE_SIZE = 25;

export function DocStatusBadge({ status }: { status: StockDocumentSummary["status"] }) {
  const t = useTranslations("inventory.docStatus");
  return <Badge variant={status === "in_transit" ? "warning" : status === "received" ? "success" : "secondary"}>{t(status)}</Badge>;
}

export function DocumentsList() {
  const t = useTranslations("inventory.documents");
  const td = useTranslations("inventory.docTypes");
  const f = useFormat();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  useEffect(() => setPage(1), [q, type, status]);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    ...(q ? { search: q } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  });
  const docs = useQuery({
    queryKey: ["stock", "documents", params.toString()],
    queryFn: () => api<Paginated<StockDocumentSummary>>(`/stock/documents?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t("search")} className="min-w-56 flex-1" />
        <FilterSelect
          label={t("type")}
          value={type}
          onChange={setType}
          options={[{ value: "", label: t("allTypes") }, ...STOCK_DOCUMENT_TYPES.map((ty) => ({ value: ty, label: td(ty) }))]}
        />
        <FilterSelect
          label={t("status")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: t("allStatuses") },
            { value: "posted", label: t("posted") },
            { value: "in_transit", label: t("inTransit") },
            { value: "received", label: t("received") },
          ]}
        />
      </Toolbar>
      {docs.isPending ? (
        <div className="grid gap-2 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : docs.data?.items.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <Table className={docs.isPlaceholderData ? "opacity-60" : undefined}>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.number")}</TH>
              <TH>{t("cols.type")}</TH>
              <TH className="hidden md:table-cell">{t("cols.warehouse")}</TH>
              <TH className="hidden lg:table-cell">{t("cols.party")}</TH>
              <TH className="text-right">{t("cols.value")}</TH>
              <TH>{t("cols.status")}</TH>
              <TH className="hidden sm:table-cell">{t("cols.date")}</TH>
            </TR>
          </THead>
          <TBody>
            {docs.data?.items.map((d) => {
              const Icon = d.type === "opening" ? ArrowLeftRight : DOC_ICONS[d.type];
              return (
                <TR key={d.id} className="cursor-pointer" onClick={() => router.push(`/inventory/documents/${d.id}`)}>
                  <TD>
                    <span className="font-mono text-sm font-medium">{d.number}</span>
                    {d.reference && <span className="text-muted-foreground block truncate text-xs">{d.reference}</span>}
                  </TD>
                  <TD>
                    <span className="flex items-center gap-1.5 text-sm">
                      <Icon className="text-muted-foreground size-4" /> {td(d.type)}
                    </span>
                  </TD>
                  <TD className="hidden text-sm md:table-cell">
                    <span className="flex items-center gap-1">
                      {d.warehouse.code}
                      {d.toWarehouse && (
                        <>
                          <ArrowRight className="text-muted-foreground size-3" /> {d.toWarehouse.code}
                        </>
                      )}
                    </span>
                  </TD>
                  <TD className="text-muted-foreground hidden text-sm lg:table-cell">{d.partner?.name ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{f.money(d.totalValue)}</TD>
                  <TD>
                    <DocStatusBadge status={d.status} />
                  </TD>
                  <TD className="text-muted-foreground hidden whitespace-nowrap text-sm sm:table-cell">{f.date(d.documentDate)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      {docs.data && docs.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={docs.data.total} onPage={setPage} />}
    </Card>
  );
}
