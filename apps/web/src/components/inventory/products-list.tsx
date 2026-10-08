"use client";

import type { Paginated } from "@stockflow/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Layers, Package, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { EmptyState, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/data/list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useDebounced } from "@/hooks/use-debounce";
import { useFormat } from "@/hooks/use-format";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Category, ProductListItem, Warehouse } from "@/lib/types";
import { ProductFormSheet } from "./product-form";
import { StockBadge } from "./stock-badge";

const PAGE_SIZE = 25;

export function ProductsList() {
  const t = useTranslations("inventory.products");
  const f = useFormat();
  const can = useCan();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState<"all" | "in" | "low" | "out">("all");
  const [categoryId, setCategoryId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [active, setActive] = useState<"true" | "false">("true");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const q = useDebounced(search);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1" && can("products.manage")) setFormOpen(true);
    const initial = params.get("stock");
    if (initial === "low" || initial === "out" || initial === "in") setStock(initial);
  }, [can]);
  useEffect(() => setPage(1), [q, stock, categoryId, warehouseId, active]);

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses"), enabled: can("warehouses.view") });
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    stock,
    active,
    ...(q ? { search: q } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
  });
  const products = useQuery({
    queryKey: ["products", params.toString()],
    queryFn: () => api<Paginated<ProductListItem>>(`/products?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder={t("search")} className="min-w-56 flex-1" />
          <FilterSelect
            label={t("filters.stock")}
            value={stock}
            onChange={setStock}
            options={[
              { value: "all", label: t("filters.allStock") },
              { value: "in", label: t("filters.inStock") },
              { value: "low", label: t("filters.low") },
              { value: "out", label: t("filters.out") },
            ]}
          />
          <FilterSelect
            label={t("filters.category")}
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: "", label: t("filters.allCategories") }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          {(warehouses.data?.length ?? 0) > 1 && (
            <FilterSelect
              label={t("filters.warehouse")}
              value={warehouseId}
              onChange={setWarehouseId}
              options={[{ value: "", label: t("filters.allWarehouses") }, ...(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))]}
            />
          )}
          <FilterSelect
            label={t("filters.status")}
            value={active}
            onChange={setActive}
            options={[
              { value: "true", label: t("filters.active") },
              { value: "false", label: t("filters.inactive") },
            ]}
          />
          {can("products.manage") && (
            <Button size="sm" className="ml-auto" onClick={() => setFormOpen(true)}>
              <Plus /> {t("new")}
            </Button>
          )}
        </Toolbar>

        {products.isPending ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : products.data?.items.length === 0 ? (
          <EmptyState
            icon={Package}
            title={q || stock !== "all" || categoryId ? t("noMatch") : t("emptyTitle")}
            body={q || stock !== "all" || categoryId ? undefined : t("emptyBody")}
            action={
              can("products.manage") && !q ? (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus /> {t("new")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table className={products.isPlaceholderData ? "opacity-60" : undefined}>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>{t("columns.product")}</TH>
                <TH className="hidden md:table-cell">{t("columns.category")}</TH>
                <TH className="text-right">{t("columns.onHand")}</TH>
                <TH>{t("columns.status")}</TH>
                <TH className="hidden text-right lg:table-cell">{t("columns.cost")}</TH>
                <TH className="hidden text-right lg:table-cell">{t("columns.price")}</TH>
                <TH className="hidden text-right sm:table-cell">{t("columns.value")}</TH>
              </TR>
            </THead>
            <TBody>
              {products.data?.items.map((p) => (
                <TR key={p.id} className="cursor-pointer" onClick={() => router.push(`/inventory/products/${p.id}`)}>
                  <TD>
                    <div className="grid">
                      <span className="flex items-center gap-1.5 font-medium">
                        {p.name}
                        {p.trackBatches && <Layers className="text-muted-foreground size-3.5" aria-label={t("batched")} />}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs">{p.sku}</span>
                    </div>
                  </TD>
                  <TD className="text-muted-foreground hidden md:table-cell">{p.category?.name ?? "—"}</TD>
                  <TD className="text-right font-medium tabular-nums">
                    {p.type === "service" ? "—" : `${f.qty(p.onHand)} `}
                    <span className="text-muted-foreground text-xs font-normal">{p.type === "service" ? "" : p.unit?.code}</span>
                  </TD>
                  <TD>
                    <StockBadge onHand={p.onHand} reorderLevel={p.reorderLevel} maxLevel={p.maxLevel} service={p.type === "service"} />
                  </TD>
                  <TD className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">{f.money(p.costPrice)}</TD>
                  <TD className="hidden text-right tabular-nums lg:table-cell">{f.money(p.sellPrice)}</TD>
                  <TD className="hidden text-right tabular-nums sm:table-cell">{f.money(p.stockValue)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {products.data && products.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={products.data.total} onPage={setPage} />}
      </Card>
      <ProductFormSheet open={formOpen} onOpenChange={setFormOpen} onSaved={(p) => router.push(`/inventory/products/${p.id}`)} />
    </>
  );
}
