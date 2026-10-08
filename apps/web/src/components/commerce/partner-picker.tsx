"use client";

import type { Paginated, PartnerType } from "@stockflow/schemas";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { ChevronsUpDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounced } from "@/hooks/use-debounce";
import { api } from "@/lib/api";
import type { Partner } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Searchable customer/supplier selector. */
export function PartnerPicker({
  type,
  value,
  onSelect,
  id,
  invalid,
}: {
  type: PartnerType;
  value: Partner | null;
  onSelect: (p: Partner) => void;
  id?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("commerce.partnerPicker");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const results = useQuery({
    queryKey: ["partners", "picker", type, q],
    queryFn: () => api<Paginated<Partner>>(`/partners?type=${type}&pageSize=20${q ? `&search=${encodeURIComponent(q)}` : ""}`),
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-invalid={invalid || undefined}
          className={cn(
            "bg-card focus-visible:border-primary focus-visible:ring-ring aria-[invalid=true]:border-destructive shadow-xs focus-visible:ring-3 flex h-9 w-full items-center gap-2 rounded-md border px-3 text-left text-sm focus-visible:outline-none",
          )}
        >
          {value ? (
            <span className="min-w-0 flex-1 truncate">{value.name}</span>
          ) : (
            <span className="text-muted-foreground flex-1">{t(`placeholder.${type}`)}</span>
          )}
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false} loop>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              autoFocus
              placeholder={t("search")}
              className="h-10 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="text-muted-foreground px-3 py-6 text-center text-sm">{results.isFetching ? t("loading") : t("empty")}</Command.Empty>
            {results.data?.items.map((p) => (
              <Command.Item
                key={p.id}
                value={p.id}
                onSelect={() => {
                  onSelect(p);
                  setOpen(false);
                  setSearch("");
                }}
                className="data-[selected=true]:bg-accent flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm"
              >
                <span className="grid min-w-0">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="text-muted-foreground truncate text-xs">{[p.code, p.city, p.phone].filter(Boolean).join(" · ")}</span>
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
