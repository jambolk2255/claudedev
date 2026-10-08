"use client";

import type { Paginated } from "@stockflow/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounced } from "@/hooks/use-debounce";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 25;
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Paginated list query with debounced search; any filter change resets to page 1. */
export function usePagedList<T>(path: string, queryKey: string, filters: Record<string, string | undefined>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(1), [q, filterKey]);
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...(q ? { search: q } : {}) });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const query = useQuery({
    queryKey: [queryKey, "list", params.toString()],
    queryFn: () => api<Paginated<T>>(`${path}?${params}`),
    placeholderData: keepPreviousData,
  });
  return { query, search, setSearch, page, setPage };
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-2 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm print:hidden">
      <ArrowLeft className="size-3.5" /> {label}
    </Link>
  );
}

export function MetaGrid({ items, className }: { items: { label: string; value: React.ReactNode; wide?: boolean }[]; className?: string }) {
  return (
    <Card className={cn("grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map((m) => (
        <div key={m.label} className={cn("grid min-w-0 gap-0.5", m.wide && "sm:col-span-2")}>
          <span className="text-muted-foreground text-xs">{m.label}</span>
          <span className="truncate text-sm font-medium">{m.value}</span>
        </div>
      ))}
    </Card>
  );
}

/** Thin progress bar used for order line fulfilment and invoice payment. */
export function Progress({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className={cn("bg-muted h-1.5 w-full overflow-hidden rounded-full", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-all duration-500", pct >= 100 ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Small KPI tile. */
export function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "danger" | "warning" | "success";
  icon?: React.ElementType;
}) {
  return (
    <Card className="grid gap-1 p-4">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </Card>
  );
}

/** Downloads rows as a CSV file (Excel-friendly UTF-8 with BOM). */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
