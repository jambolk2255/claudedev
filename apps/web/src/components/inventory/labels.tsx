"use client";

import JsBarcode from "jsbarcode";
import { Printer, Tags, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/data/list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFormat } from "@/hooks/use-format";
import type { ProductListItem } from "@/lib/types";
import { ProductPicker } from "./product-picker";

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: /^\d{13}$/.test(value) ? "EAN13" : "CODE128",
        height: 36,
        width: 1.4,
        fontSize: 11,
        margin: 0,
        displayValue: true,
      });
    } catch {
      JsBarcode(ref.current, value, { format: "CODE128", height: 36, width: 1.4, fontSize: 11, margin: 0 });
    }
  }, [value]);
  return <svg ref={ref} className="h-auto max-w-full" />;
}

/** Pick products and copies, then print a sheet of barcode labels (A4, 3 columns). */
export function LabelsPage() {
  const t = useTranslations("inventory.labels");
  const f = useFormat();
  const [items, setItems] = useState<{ product: ProductListItem; copies: number }[]>([]);
  const [showPrice, setShowPrice] = useState(true);
  const labels = items.flatMap((i) => Array.from({ length: Math.max(0, i.copies) }, () => i.product));

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 p-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <ProductPicker
            className="min-w-64 flex-1"
            value={null}
            exclude={items.map((i) => i.product.id)}
            onSelect={(p) => setItems((xs) => [...xs, { product: p, copies: 1 }])}
          />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showPrice} onCheckedChange={setShowPrice} /> {t("showPrice")}
          </label>
          <Button onClick={() => window.print()} disabled={labels.length === 0}>
            <Printer /> {t("print", { count: labels.length })}
          </Button>
        </div>
        {items.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {items.map((i) => (
              <li key={i.product.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {i.product.name} <span className="text-muted-foreground font-mono text-xs">{i.product.barcode ?? i.product.sku}</span>
                </span>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  aria-label={t("copies")}
                  className="h-8 w-20 text-right tabular-nums"
                  value={i.copies}
                  onChange={(e) =>
                    setItems((xs) => xs.map((x) => (x.product.id === i.product.id ? { ...x, copies: Math.min(500, Number(e.target.value) || 0) } : x)))
                  }
                />
                <Button variant="ghost" size="icon" aria-label={t("remove")} onClick={() => setItems((xs) => xs.filter((x) => x.product.id !== i.product.id))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {labels.length === 0 ? (
        <Card className="print:hidden">
          <EmptyState icon={Tags} title={t("emptyTitle")} body={t("emptyBody")} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3 print:gap-1">
          {labels.map((p, idx) => (
            <div key={idx} className="grid break-inside-avoid justify-items-center gap-1 rounded-md border bg-white p-2 text-center text-black">
              <span className="line-clamp-1 text-xs font-semibold">{p.name}</span>
              <Barcode value={p.barcode ?? p.sku} />
              {showPrice && <span className="text-sm font-bold">{f.money(p.sellPrice)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
