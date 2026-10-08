"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Stat, downloadCsv } from "@/components/commerce/ui";
import { FilterSelect } from "@/components/data/list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { Warehouse } from "@/lib/types";

const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

function useRange() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  return { from, to, setFrom, setTo };
}

function RangeInputs({ r }: { r: ReturnType<typeof useRange> }) {
  const t = useTranslations("reports");
  return (
    <>
      <Input type="date" className="h-9 w-auto" aria-label={t("from")} value={r.from} onChange={(e) => r.setFrom(e.target.value)} />
      <Input type="date" className="h-9 w-auto" aria-label={t("to")} value={r.to} onChange={(e) => r.setTo(e.target.value)} />
    </>
  );
}

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = useTranslations("reports");
  const can = useCan();
  if (!can("reports.export")) return null;
  return (
    <Button variant="outline" size="sm" className="ml-auto" onClick={onClick} disabled={disabled}>
      <Download /> {t("export")}
    </Button>
  );
}

/** Bar chart in the brand colour; values formatted as compact money. */
export function MoneyBars({
  data,
  dataKey,
  nameKey,
  height = 260,
  secondKey,
}: {
  data: object[];
  dataKey: string;
  nameKey: string;
  height?: number;
  secondKey?: string;
}) {
  const f = useFormat();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={nameKey} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" interval="preserveStartEnd" minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} width={64} stroke="var(--muted-foreground)" tickFormatter={(v: number) => f.compactMoney(v)} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => f.money(v)}
        />
        <Bar animationDuration={500} dataKey={dataKey} fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        {secondKey && (
          <Bar animationDuration={500} dataKey={secondKey} fill="var(--muted-foreground)" fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={36} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

type Row = { key: string; quantity: number; net: number; tax: number; total: number; invoices?: number; bills?: number };

export function SalesReport({ kind }: { kind: "sales" | "purchases" }) {
  const t = useTranslations("reports");
  const f = useFormat();
  const r = useRange();
  const sales = kind === "sales";
  const [groupBy, setGroupBy] = useState(sales ? "day" : "supplier");
  const q = useQuery({
    queryKey: ["reports", kind, r.from, r.to, groupBy],
    queryFn: () =>
      api<{ rows: Row[]; totals: { net: number; returns?: number; netAfterReturns?: number; total?: number } }>(
        `/reports/${kind}?from=${r.from}&to=${r.to}&groupBy=${groupBy}`,
      ),
  });
  const options = (sales ? ["day", "month", "product", "customer"] : ["month", "product", "supplier"]).map((g) => ({ value: g, label: t(`groupBy.${g}`) }));
  const timeSeries = groupBy === "day" || groupBy === "month";
  const chartData = timeSeries ? q.data?.rows : q.data?.rows.slice(0, 12);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <RangeInputs r={r} />
        <FilterSelect label={t("groupByLabel")} value={groupBy} onChange={setGroupBy} options={options} />
        <ExportButton
          disabled={!q.data?.rows.length}
          onClick={() =>
            downloadCsv(`${kind}-${groupBy}-${r.from}-${r.to}.csv`, [
              [t(`groupBy.${groupBy}`), t(sales ? "cols.invoices" : "cols.bills"), t("cols.quantity"), t("cols.net"), t("cols.tax"), t("cols.total")],
              ...q.data!.rows.map((x) => [x.key, x.invoices ?? x.bills ?? 0, x.quantity, x.net, x.tax, x.total]),
            ])
          }
        />
      </div>
      {!q.data ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t(sales ? "netSales" : "netPurchases")} value={f.money(q.data.totals.net)} />
            {sales ? (
              <>
                <Stat label={t("returns")} value={f.money(q.data.totals.returns ?? 0)} />
                <Stat label={t("netAfterReturns")} value={f.money(q.data.totals.netAfterReturns ?? 0)} />
              </>
            ) : (
              <Stat label={t("totalWithTax")} value={f.money(q.data.totals.total ?? 0)} />
            )}
          </div>
          {chartData && chartData.length > 0 && (
            <Card className="p-4">
              <MoneyBars data={chartData} dataKey="net" nameKey="key" />
            </Card>
          )}
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{t(`groupBy.${groupBy}`)}</TH>
                  <TH className="hidden text-right sm:table-cell">{t(sales ? "cols.invoices" : "cols.bills")}</TH>
                  <TH className="hidden text-right md:table-cell">{t("cols.quantity")}</TH>
                  <TH className="text-right">{t("cols.net")}</TH>
                  <TH className="hidden text-right md:table-cell">{t("cols.tax")}</TH>
                  <TH className="text-right">{t("cols.total")}</TH>
                </TR>
              </THead>
              <TBody>
                {q.data.rows.map((x) => (
                  <TR key={x.key}>
                    <TD className="text-sm">{x.key}</TD>
                    <TD className="hidden text-right tabular-nums sm:table-cell">{x.invoices ?? x.bills}</TD>
                    <TD className="hidden text-right tabular-nums md:table-cell">{f.qty(x.quantity)}</TD>
                    <TD className="text-right font-medium tabular-nums">{f.money(x.net)}</TD>
                    <TD className="text-muted-foreground hidden text-right tabular-nums md:table-cell">{f.money(x.tax)}</TD>
                    <TD className="text-right tabular-nums">{f.money(x.total)}</TD>
                  </TR>
                ))}
                {q.data.rows.length === 0 && (
                  <TR className="hover:bg-transparent">
                    <TD colSpan={6} className="text-muted-foreground py-10 text-center text-sm">
                      {t("noData")}
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

interface Margins {
  rows: { productId: string; sku: string; name: string; quantity: number; revenue: number; cogs: number; margin: number; marginPct: number }[];
  totals: { revenue: number; cogs: number; margin: number; marginPct: number };
}

export function MarginsReport() {
  const t = useTranslations("reports");
  const f = useFormat();
  const r = useRange();
  const q = useQuery({ queryKey: ["reports", "margins", r.from, r.to], queryFn: () => api<Margins>(`/reports/margins?from=${r.from}&to=${r.to}`) });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <RangeInputs r={r} />
        <ExportButton
          disabled={!q.data?.rows.length}
          onClick={() =>
            downloadCsv(`margins-${r.from}-${r.to}.csv`, [
              ["SKU", t("cols.product"), t("cols.quantity"), t("cols.revenue"), t("cols.cogs"), t("cols.margin"), "%"],
              ...q.data!.rows.map((x) => [x.sku, x.name, x.quantity, x.revenue, x.cogs, x.margin, x.marginPct]),
            ])
          }
        />
      </div>
      {!q.data ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t("cols.revenue")} value={f.money(q.data.totals.revenue)} />
            <Stat label={t("cols.cogs")} value={f.money(q.data.totals.cogs)} />
            <Stat
              label={t("grossMargin")}
              value={f.money(q.data.totals.margin)}
              hint={`${q.data.totals.marginPct}%`}
              tone={q.data.totals.margin < 0 ? "danger" : "success"}
            />
          </div>
          {q.data.rows.length > 0 && (
            <Card className="p-4">
              <MoneyBars data={q.data.rows.slice(0, 12).map((x) => ({ ...x, label: x.sku }))} dataKey="revenue" secondKey="cogs" nameKey="label" />
            </Card>
          )}
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{t("cols.product")}</TH>
                  <TH className="hidden text-right sm:table-cell">{t("cols.quantity")}</TH>
                  <TH className="text-right">{t("cols.revenue")}</TH>
                  <TH className="hidden text-right md:table-cell">{t("cols.cogs")}</TH>
                  <TH className="text-right">{t("cols.margin")}</TH>
                  <TH className="text-right">%</TH>
                </TR>
              </THead>
              <TBody>
                {q.data.rows.map((x) => (
                  <TR key={x.productId}>
                    <TD>
                      <span className="text-sm font-medium">{x.name}</span>
                      <span className="text-muted-foreground block font-mono text-xs">{x.sku}</span>
                    </TD>
                    <TD className="hidden text-right tabular-nums sm:table-cell">{f.qty(x.quantity)}</TD>
                    <TD className="text-right tabular-nums">{f.money(x.revenue)}</TD>
                    <TD className="text-muted-foreground hidden text-right tabular-nums md:table-cell">{f.money(x.cogs)}</TD>
                    <TD className={x.margin < 0 ? "text-destructive text-right font-medium tabular-nums" : "text-right font-medium tabular-nums"}>
                      {f.money(x.margin)}
                    </TD>
                    <TD className="text-right tabular-nums">{x.marginPct}%</TD>
                  </TR>
                ))}
                {q.data.rows.length === 0 && (
                  <TR className="hover:bg-transparent">
                    <TD colSpan={6} className="text-muted-foreground py-10 text-center text-sm">
                      {t("noData")}
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

interface Valuation {
  rows: { productId: string; sku: string; name: string; category: string | null; unit: string | null; quantity: number; value: number; avgCost: number }[];
  totals: { quantity: number; value: number };
}

export function ValuationReport() {
  const t = useTranslations("reports");
  const f = useFormat();
  const [warehouseId, setWarehouseId] = useState("");
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });
  const q = useQuery({
    queryKey: ["reports", "valuation", warehouseId],
    queryFn: () => api<Valuation>(`/reports/stock-valuation${warehouseId ? `?warehouseId=${warehouseId}` : ""}`),
  });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label={t("warehouse")}
          value={warehouseId}
          onChange={setWarehouseId}
          options={[{ value: "", label: t("allWarehouses") }, ...(warehouses.data ?? []).map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))]}
        />
        <ExportButton
          disabled={!q.data?.rows.length}
          onClick={() =>
            downloadCsv(`stock-valuation-${new Date().toISOString().slice(0, 10)}.csv`, [
              ["SKU", t("cols.product"), t("cols.category"), t("cols.quantity"), t("cols.unit"), t("cols.avgCost"), t("cols.value")],
              ...q.data!.rows.map((x) => [x.sku, x.name, x.category, x.quantity, x.unit, x.avgCost, x.value]),
            ])
          }
        />
      </div>
      {!q.data ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label={t("stockValue")} value={f.money(q.data.totals.value)} />
            <Stat label={t("products")} value={q.data.rows.length} />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{t("cols.product")}</TH>
                  <TH className="hidden md:table-cell">{t("cols.category")}</TH>
                  <TH className="text-right">{t("cols.quantity")}</TH>
                  <TH className="hidden text-right sm:table-cell">{t("cols.avgCost")}</TH>
                  <TH className="text-right">{t("cols.value")}</TH>
                </TR>
              </THead>
              <TBody>
                {q.data.rows.map((x) => (
                  <TR key={x.productId}>
                    <TD>
                      <span className="text-sm font-medium">{x.name}</span>
                      <span className="text-muted-foreground block font-mono text-xs">{x.sku}</span>
                    </TD>
                    <TD className="text-muted-foreground hidden text-sm md:table-cell">{x.category ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {f.qty(x.quantity)} <span className="text-muted-foreground text-xs">{x.unit}</span>
                    </TD>
                    <TD className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">{f.money(x.avgCost)}</TD>
                    <TD className="text-right font-medium tabular-nums">{f.money(x.value)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
