"use client";

import type { Paginated } from "@stockflow/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { api } from "@/lib/api";

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  ip: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

const PAGE_SIZE = 20;

function tone(action: string) {
  if (/failed|locked|revoked|deleted|disabled/.test(action)) return "destructive" as const;
  if (/created|joined|enabled|completed/.test(action)) return "success" as const;
  return "secondary" as const;
}

export function AuditSettings() {
  const t = useTranslations("settings.audit");
  const format = useFormatter();
  const [page, setPage] = useState(1);
  const audit = useQuery({
    queryKey: ["audit", page],
    queryFn: () => api<Paginated<AuditRow>>(`/audit?page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });
  const pages = audit.data ? Math.max(1, Math.ceil(audit.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("columns.when")}</TH>
              <TH>{t("columns.user")}</TH>
              <TH>{t("columns.action")}</TH>
              <TH className="hidden md:table-cell">{t("columns.ip")}</TH>
            </TR>
          </THead>
          <TBody className={audit.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {audit.isPending ? (
              Array.from({ length: 6 }, (_, i) => (
                <TR key={i}>
                  <TD colSpan={4}>
                    <Skeleton className="h-6" />
                  </TD>
                </TR>
              ))
            ) : audit.data?.items.length === 0 ? (
              <TR>
                <TD colSpan={4} className="text-muted-foreground py-12 text-center">
                  <ScrollText className="mx-auto mb-2 size-6 opacity-40" />
                  {t("empty")}
                </TD>
              </TR>
            ) : (
              audit.data?.items.map((row) => (
                <TR key={row.id}>
                  <TD className="text-muted-foreground whitespace-nowrap text-sm" title={new Date(row.createdAt).toLocaleString()}>
                    {format.relativeTime(new Date(row.createdAt))}
                  </TD>
                  <TD className="text-sm">{row.user?.name ?? t("system")}</TD>
                  <TD>
                    <Badge variant={tone(row.action)} className="font-mono">
                      {row.action}
                    </Badge>
                  </TD>
                  <TD className="text-muted-foreground hidden font-mono text-xs md:table-cell">{row.ip ?? "—"}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        <div className="text-muted-foreground flex items-center justify-between border-t px-4 py-3 text-sm">
          <span>{t("pageOf", { page, pages })}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t("prev")}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label={t("next")}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
