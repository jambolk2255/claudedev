"use client";

import type { Paginated } from "@stockflow/schemas";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { ChevronsUpDown, Layers, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounced } from "@/hooks/use-debounce";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { ProductListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Searchable product selector showing on-hand stock in the chosen warehouse. */
export function ProductPicker({
  value,
  onSelect,
  warehouseId,
  exclude = [],
  className,
  includeServices,
}: {
  value: ProductListItem | null;
  onSelect: (p: ProductListItem) => void;
  warehouseId?: string;
  exclude?: string[];
  className?: string;
  /** Orders and invoices can also contain non-stock (service) items. */
  includeServices?: boolean;
}) {
  const t = useTranslations("inventory.picker");
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const results = useQuery({
    queryKey: ["products", "picker", q, warehouseId],
    queryFn: () => api<Paginated<ProductListItem>>(`/products?pageSize=20&search=${encodeURIComponent(q)}${warehouseId ? `&warehouseId=${warehouseId}` : ""}`),
    enabled: open,
  });
  const items = (results.data?.items ?? []).filter((p) => includeServices || p.type === "stock");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "bg-card focus-visible:border-primary focus-visible:ring-ring shadow-xs focus-visible:ring-3 flex h-9 w-full items-center gap-2 rounded-md border px-3 text-left text-sm focus-visible:outline-none",
            className,
          )}
        >
          {value ? (
            <span className="min-w-0 flex-1 truncate">
              <span className="text-muted-foreground font-mono text-xs">{value.sku}</span> {value.name}
            </span>
          ) : (
            <span className="text-muted-foreground flex-1">{t("placeholder")}</span>
          )}
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] p-0">
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
          <Command.List className="max-h-72 overflow-y-auto p-1">
            {results.isFetching && items.length === 0 && <div className="text-muted-foreground px-3 py-6 text-center text-sm">{t("loading")}</div>}
            <Command.Empty className="text-muted-foreground px-3 py-6 text-center text-sm">{t("empty")}</Command.Empty>
            {items.map((p) => {
              const used = exclude.includes(p.id);
              return (
                <Command.Item
                  key={p.id}
                  value={p.id}
                  disabled={used}
                  onSelect={() => {
                    onSelect(p);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="data-[selected=true]:bg-accent flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm data-[disabled=true]:opacity-40"
                >
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
                      {p.sku}
                      {p.trackBatches && <Layers className="size-3" aria-label={t("batched")} />}
                    </span>
                  </span>
                  <span className={cn("text-right text-xs tabular-nums", p.onHand <= 0 ? "text-destructive" : "text-muted-foreground")}>
                    {f.qty(p.onHand)} {p.unit?.code}
                  </span>
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
