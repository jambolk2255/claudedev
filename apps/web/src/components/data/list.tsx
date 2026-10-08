"use client";

import { ChevronLeft, ChevronRight, Search, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-2.5 size-4" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 pl-8" type="search" aria-label={placeholder} />
    </div>
  );
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label} className={cn("h-9 w-auto min-w-36", className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b p-3">{children}</div>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const t = useTranslations("list");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="text-muted-foreground flex items-center justify-between border-t px-4 py-2.5 text-sm">
      <span className="tabular-nums">{t("range", { from, to, total })}</span>
      <div className="flex gap-1">
        <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("prev")}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("next")}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 px-6 py-14 text-center">
      <span className="bg-muted text-muted-foreground grid size-11 place-content-center rounded-lg">
        <Icon className="size-5" />
      </span>
      <div className="grid gap-1">
        <p className="font-medium">{title}</p>
        {body && <p className="text-muted-foreground max-w-sm text-sm">{body}</p>}
      </div>
      {action}
    </div>
  );
}

/** Secondary navigation for a module area (Inventory, Contacts). */
export { SubNav } from "./sub-nav";
