"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileUp, TriangleAlert, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { downloadCsv } from "@/components/commerce/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Warehouse } from "@/lib/types";
import { cn } from "@/lib/utils";

const DATASETS = {
  products: {
    columns: ["sku", "name", "category", "unit", "cost", "price", "tax", "reorder", "max", "batches"],
    sample: ["P-001", "Sample product", "General", "PCS", "100", "150", "VAT", "10", "", "no"],
    permission: "products.manage",
  },
  customers: {
    columns: ["code", "name", "contact", "email", "phone", "taxNo", "address", "city", "creditLimit", "terms"],
    sample: ["", "Sample Customer", "", "", "0771234567", "", "", "Colombo", "50000", "30"],
    permission: "sales.manage",
  },
  suppliers: {
    columns: ["code", "name", "contact", "email", "phone", "taxNo", "address", "city", "creditLimit", "terms"],
    sample: ["", "Sample Supplier", "", "", "", "", "", "Kandy", "", "30"],
    permission: "purchasing.manage",
  },
  opening: { columns: ["sku", "quantity", "cost", "batch", "expiry"], sample: ["P-001", "25", "100", "", ""], permission: "inventory.stock_in" },
} as const;
type Dataset = keyof typeof DATASETS;

interface ImportResult {
  rows: number;
  valid: number;
  creates?: number;
  updates?: number;
  errors: { row: number; field?: string; message: string }[];
  imported: boolean;
}

export function ImportPage() {
  const t = useTranslations("importer");
  const can = useCan();
  const qc = useQueryClient();
  const available = (Object.keys(DATASETS) as Dataset[]).filter((d) => can(DATASETS[d].permission));
  const [dataset, setDataset] = useState<Dataset>(available[0] ?? "products");
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });
  const [warehouseId, setWarehouseId] = useState("");
  const wh = warehouseId || warehouses.data?.find((w) => w.isDefault)?.id || "";

  function reset(d?: Dataset) {
    if (d) setDataset(d);
    setRows(null);
    setResult(null);
    setFileName("");
  }

  function parse(file: File) {
    setFileName(file.name);
    setResult(null);
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        if (!res.data.length) return toast.error(t("emptyFile"));
        setRows(res.data);
        void run(res.data, true);
      },
      error: () => toast.error(t("parseError")),
    });
  }

  async function run(data: Record<string, unknown>[], dryRun: boolean) {
    setBusy(true);
    try {
      const path = dataset === "opening" ? "/import/opening-stock" : dataset === "products" ? "/import/products" : "/import/partners";
      const body = {
        rows: data,
        dryRun,
        ...(dataset === "customers" ? { type: "customer" } : dataset === "suppliers" ? { type: "supplier" } : {}),
        ...(dataset === "opening" ? { warehouseId: wh } : {}),
      };
      const res = await api<ImportResult>(path, { method: "POST", body });
      setResult(res);
      if (res.imported) {
        toast.success(t("done", { count: res.valid }));
        await Promise.all(["products", "partners", "stock"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      }
    } catch (err) {
      handleFormError(err);
    } finally {
      setBusy(false);
    }
  }

  const spec = DATASETS[dataset];
  const ok = result && result.errors.length === 0;

  return (
    <div className="grid gap-4">
      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" className="bg-muted inline-flex flex-wrap rounded-lg p-1">
            {available.map((d) => (
              <button
                key={d}
                role="tab"
                aria-selected={dataset === d}
                onClick={() => reset(d)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                  dataset === d ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`datasets.${d}`)}
              </button>
            ))}
          </div>
          {dataset === "opening" && (
            <NativeSelect className="h-9 w-auto" value={wh} onChange={(e) => (setWarehouseId(e.target.value), setResult(null))} aria-label={t("warehouse")}>
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </NativeSelect>
          )}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => downloadCsv(`${dataset}-template.csv`, [[...spec.columns], [...spec.sample]])}>
            <Download /> {t("template")}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {t("columns")} <span className="font-mono text-xs">{spec.columns.join(", ")}</span>
        </p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const file = e.dataTransfer.files[0];
            if (file) parse(file);
          }}
          className={cn(
            "grid place-items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            drag ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/40",
          )}
        >
          <FileUp className="text-muted-foreground size-8" />
          <span className="font-medium">{fileName || t("drop")}</span>
          <span className="text-muted-foreground text-xs">{rows ? t("rowsRead", { count: rows.length }) : t("dropHint")}</span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) parse(file);
            e.target.value = "";
          }}
        />
      </Card>

      {result && (
        <Card className="grid gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            {ok ? <CheckCircle2 className="text-success size-5" /> : <TriangleAlert className="text-destructive size-5" />}
            <p className="font-medium">
              {result.imported
                ? t("importedSummary", { count: result.valid })
                : ok
                  ? t("readySummary", { count: result.valid })
                  : t("errorSummary", { count: result.errors.length })}
            </p>
            {result.creates !== undefined && !result.imported && (
              <span className="text-muted-foreground text-sm">{t("createUpdate", { creates: result.creates, updates: result.updates ?? 0 })}</span>
            )}
            {ok && !result.imported && rows && (
              <Button className="ml-auto" loading={busy} onClick={() => run(rows, false)}>
                {!busy && <Upload />} {t("import", { count: result.valid })}
              </Button>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH className="w-20">{t("row")}</TH>
                    <TH className="w-32">{t("field")}</TH>
                    <TH>{t("problem")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {result.errors.map((e, i) => (
                    <TR key={i}>
                      <TD className="tabular-nums">{e.row}</TD>
                      <TD className="font-mono text-xs">{e.field ?? "—"}</TD>
                      <TD className="text-sm">{e.message}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
