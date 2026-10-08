"use client";

import type { Paginated, PartnerType } from "@stockflow/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookUser, MapPin, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { EmptyState, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useDebounced } from "@/hooks/use-debounce";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { Partner } from "@/lib/types";
import { PartnerFormSheet } from "./partner-form";

const PAGE_SIZE = 25;

export function PartnersList({ type }: { type: PartnerType }) {
  const t = useTranslations("contacts");
  const f = useFormat();
  const can = useCan();
  const manage = can(type === "customer" ? "sales.manage" : "purchasing.manage");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<"true" | "false">("true");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [open, setOpen] = useState(false);
  const q = useDebounced(search);
  useEffect(() => setPage(1), [q, active]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1" && manage) setOpen(true);
  }, [manage]);

  const params = new URLSearchParams({ type, page: String(page), pageSize: String(PAGE_SIZE), active, ...(q ? { search: q } : {}) });
  const list = useQuery({
    queryKey: ["partners", params.toString()],
    queryFn: () => api<Paginated<Partner>>(`/partners?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder={t("search")} className="min-w-56 flex-1" />
          <FilterSelect
            label={t("status")}
            value={active}
            onChange={setActive}
            options={[
              { value: "true", label: t("active") },
              { value: "false", label: t("inactive") },
            ]}
          />
          {manage && (
            <Button size="sm" className="ml-auto" onClick={() => (setEditing(null), setOpen(true))}>
              <Plus /> {t(`new.${type}`)}
            </Button>
          )}
        </Toolbar>
        {list.isPending ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : list.data?.items.length === 0 ? (
          <EmptyState
            icon={BookUser}
            title={q ? t("noMatch") : t(`empty.${type}`)}
            action={
              manage && !q ? (
                <Button size="sm" onClick={() => (setEditing(null), setOpen(true))}>
                  <Plus /> {t(`new.${type}`)}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table className={list.isPlaceholderData ? "opacity-60" : undefined}>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>{t("cols.name")}</TH>
                <TH className="hidden md:table-cell">{t("cols.contact")}</TH>
                <TH className="hidden lg:table-cell">{t("cols.city")}</TH>
                <TH className="hidden sm:table-cell">{t("cols.terms")}</TH>
                {type === "customer" && <TH className="hidden text-right lg:table-cell">{t("cols.credit")}</TH>}
              </TR>
            </THead>
            <TBody>
              {list.data?.items.map((p) => (
                <TR key={p.id} className={manage ? "cursor-pointer" : undefined} onClick={() => manage && (setEditing(p), setOpen(true))}>
                  <TD>
                    <span className="flex items-center gap-2 font-medium">
                      {p.name} {!p.active && <Badge variant="outline">{t("inactive")}</Badge>}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">{p.code}</span>
                  </TD>
                  <TD className="hidden text-sm md:table-cell">
                    {p.contactName && <span className="block">{p.contactName}</span>}
                    <span className="text-muted-foreground text-xs">{[p.phone, p.email].filter(Boolean).join(" · ") || "—"}</span>
                  </TD>
                  <TD className="hidden text-sm lg:table-cell">
                    <span className="flex items-center gap-1.5">
                      {p.city ?? "—"}
                      {p.latitude && p.longitude && (
                        <a
                          href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t("map")}
                          className="text-primary"
                        >
                          <MapPin className="size-3.5" />
                        </a>
                      )}
                    </span>
                  </TD>
                  <TD className="text-muted-foreground hidden text-sm sm:table-cell">
                    {p.paymentTermsDays ? t("days", { n: p.paymentTermsDays }) : t("cash")}
                  </TD>
                  {type === "customer" && <TD className="hidden text-right tabular-nums lg:table-cell">{p.creditLimit ? f.money(p.creditLimit) : "—"}</TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && list.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />}
      </Card>
      <PartnerFormSheet type={type} open={open} onOpenChange={setOpen} partner={editing} />
    </>
  );
}
