"use client";

import type { Paginated } from "@stockflow/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { EmptyState, FilterSelect, Pagination, Toolbar } from "@/components/data/list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Movement, Warehouse } from "@/lib/types";
import { MovementTypeBadge, SignedQty } from "./movement-type";

const PAGE_SIZE = 50;
const TYPES = ["stock_in", "stock_out", "adjustment_in", "adjustment_out", "transfer_out", "transfer_in"] as const;

/** The stock ledger: every quantity change, newest first. */
export function MovementsList() {
  const t = useTranslations("inventory.movements");
  const tm = useTranslations("inventory.movementTypes");
  const f = useFormat();
  const can = useCan();
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setProductId(new URLSearchParams(window.location.search).get("product") ?? ""), []);
  useEffect(() => setPage(1), [productId, warehouseId, type]);

  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses"), enabled: can("warehouses.view") });
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    ...(productId ? { productId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(type ? { type } : {}),
  });
  const moves = useQuery({
    queryKey: ["stock", "movements", params.toString()],
    queryFn: () => api<Paginated<Movement>>(`/stock/movements?${params}`),
    placeholderData: keepPreviousData,
  });
  const productName = productId ? moves.data?.items[0]?.product : undefined;

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <FilterSelect
          label={t("type")}
          value={type}
          onChange={setType}
          options={[{ value: "", label: t("allTypes") }, ...TYPES.map((ty) => ({ value: ty, label: tm(ty) }))]}
        />
        {(warehouses.data?.length ?? 0) > 1 && (
          <FilterSelect
            label={t("warehouse")}
            value={warehouseId}
            onChange={setWarehouseId}
            options={[{ value: "", label: t("allWarehouses") }, ...(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))]}
          />
        )}
        {productId && (
          <Button variant="secondary" size="sm" onClick={() => setProductId("")}>
            {productName ? `${productName.sku} · ${productName.name}` : t("product")} <X />
          </Button>
        )}
        <p className="text-muted-foreground ml-auto text-xs">{t("immutable")}</p>
      </Toolbar>
      {moves.isPending ? (
        <div className="grid gap-2 p-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : moves.data?.items.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <Table className={moves.isPlaceholderData ? "opacity-60" : undefined}>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("cols.date")}</TH>
              <TH>{t("cols.product")}</TH>
              <TH>{t("cols.type")}</TH>
              <TH className="hidden md:table-cell">{t("cols.document")}</TH>
              <TH className="hidden sm:table-cell">{t("cols.warehouse")}</TH>
              <TH className="text-right">{t("cols.qty")}</TH>
              <TH className="hidden text-right lg:table-cell">{t("cols.value")}</TH>
              <TH className="text-right">{t("cols.balance")}</TH>
              <TH className="hidden xl:table-cell">{t("cols.user")}</TH>
            </TR>
          </THead>
          <TBody>
            {moves.data?.items.map((m) => (
              <TR key={m.id}>
                <TD className="text-muted-foreground whitespace-nowrap text-xs">{f.dateTime(m.createdAt)}</TD>
                <TD>
                  {m.product && (
                    <Link href={`/inventory/products/${m.product.id}`} className="hover:underline">
                      <span className="block max-w-56 truncate text-sm font-medium">{m.product.name}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {m.product.sku}
                        {m.batch && ` · ${m.batch.batchNo}`}
                      </span>
                    </Link>
                  )}
                </TD>
                <TD>
                  <MovementTypeBadge type={m.type} />
                </TD>
                <TD className="hidden md:table-cell">
                  {m.document && (
                    <Link href={`/inventory/documents/${m.document.id}`} className="text-primary font-mono text-xs hover:underline">
                      {m.document.number}
                    </Link>
                  )}
                </TD>
                <TD className="hidden font-mono text-xs sm:table-cell">{m.warehouse.code}</TD>
                <TD className="text-right tabular-nums">
                  <SignedQty value={m.quantity} format={f.qty} />
                </TD>
                <TD className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">{f.money(m.totalCost)}</TD>
                <TD className="text-right font-medium tabular-nums">{f.qty(m.balanceAfter)}</TD>
                <TD className="text-muted-foreground hidden text-sm xl:table-cell">{m.createdBy?.name ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {moves.data && moves.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={moves.data.total} onPage={setPage} />}
    </Card>
  );
}
