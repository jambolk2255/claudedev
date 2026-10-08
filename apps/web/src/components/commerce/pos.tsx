"use client";

import { PAYMENT_METHODS, calcLine, sumLines, type Paginated, type PaymentMethod } from "@stockflow/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Minus, Plus, Printer, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ScanButton } from "@/components/inventory/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { useDebounced } from "@/hooks/use-debounce";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { ApiError, api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Partner, ProductListItem, Warehouse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PartnerPicker } from "./partner-picker";
import { pickAccount, useCashAccounts } from "./payment-sheet";
import { useTaxes } from "./use-taxes";

type CartLine = { product: ProductListItem; qty: number; price: number; discountPct: number };
type SaleResult = { invoiceId: string; number: string; total: number; change: number };

/** Counter sale: invoice, stock issue and receipt in one step. */
export function PointOfSale() {
  const t = useTranslations("commerce.pos");
  const tm = useTranslations("commerce.methods");
  const tc = useTranslations("common");
  const f = useFormat();
  const qc = useQueryClient();
  const { taxRates, ssclRate } = useTaxes("sales");
  const accounts = useCashAccounts();
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });
  const active = (warehouses.data ?? []).filter((w) => w.active);
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 200);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Partner | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!warehouseId && active.length) setWarehouseId((active.find((w) => w.isDefault) ?? active[0])!.id);
  }, [active, warehouseId]);

  const products = useQuery({
    queryKey: ["products", "pos", q, warehouseId],
    queryFn: () =>
      api<Paginated<ProductListItem>>(`/products?pageSize=24&active=true&search=${encodeURIComponent(q)}${warehouseId ? `&warehouseId=${warehouseId}` : ""}`),
    enabled: !!warehouseId,
  });

  const rate = (p: ProductListItem) => Number(taxRates.find((r) => r.id === p.taxRateId)?.rate ?? 0);
  const amounts = cart.map((l) => calcLine({ quantity: l.qty, unitPrice: l.price, discountPct: l.discountPct, taxRate: rate(l.product) }, ssclRate));
  const totals = sumLines(amounts);
  const total = Number(totals.total);
  const paid = Number(tendered) || 0;
  const change = Math.max(0, Math.round((paid - total) * 100) / 100);

  function add(p: ProductListItem) {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === p.id);
      if (existing) return c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { product: p, qty: 1, price: Number(p.sellPrice), discountPct: 0 }];
    });
  }

  async function lookup(code: string) {
    try {
      add(await api<ProductListItem>(`/products/lookup?code=${encodeURIComponent(code)}`));
      setSearch("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) toast.error(t("notFound", { code }));
      else handleFormError(err);
    }
  }

  async function complete() {
    if (cart.length === 0) return;
    if (method === "cash" && tendered && paid < total) return toast.error(t("underpaid"));
    const account = pickAccount(accounts, method);
    if (!account) return toast.error(t("noAccount"));
    setSaving(true);
    try {
      const res = await api<SaleResult>("/quick-sale", {
        method: "POST",
        body: {
          warehouseId,
          partnerId: customer?.id ?? null,
          lines: cart.map((l) => ({ productId: l.product.id, quantity: l.qty, unitPrice: l.price, discountPct: l.discountPct })),
          payment: { method, accountId: account.id, ...(method === "cash" && tendered ? { tendered: paid } : {}), reference: null },
        },
      });
      setResult(res);
      setCart([]);
      setTendered("");
      setCustomer(null);
      void Promise.all(["products", "invoices", "payments", "stock", "finance"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      <Card className="flex min-h-[60vh] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-48 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-2.5 size-4" />
            <Input
              ref={searchRef}
              autoFocus
              type="search"
              className="h-9 pl-8"
              placeholder={t("search")}
              aria-label={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  e.preventDefault();
                  const exact = products.data?.items.length === 1 ? products.data.items[0] : undefined;
                  if (exact) {
                    add(exact);
                    setSearch("");
                  } else void lookup(search.trim());
                }
              }}
            />
          </div>
          <ScanButton onDetect={(code) => void lookup(code)} />
          <NativeSelect className="h-9 w-auto" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} aria-label={t("warehouse")}>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
          {products.data?.items.map((p) => {
            const out = p.type === "stock" && p.onHand <= 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p)}
                className={cn(
                  "bg-card hover:border-primary/50 hover:bg-primary/5 grid gap-1 rounded-lg border p-3 text-left transition-colors active:scale-[0.98]",
                  out && "opacity-60",
                )}
              >
                <span className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</span>
                <span className="text-muted-foreground font-mono text-[11px]">{p.sku}</span>
                <span className="mt-1 flex items-end justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums">{f.money(p.sellPrice)}</span>
                  {p.type === "stock" && (
                    <span className={cn("text-[11px] tabular-nums", out ? "text-destructive" : "text-muted-foreground")}>{f.qty(p.onHand)}</span>
                  )}
                </span>
              </button>
            );
          })}
          {products.data?.items.length === 0 && <p className="text-muted-foreground col-span-full py-10 text-center text-sm">{t("noProducts")}</p>}
        </div>
      </Card>

      <Card className="flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)]">
        <div className="grid gap-2 border-b p-3">
          <PartnerPicker type="customer" value={customer} onSelect={setCustomer} />
          {customer ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs"
              onClick={() => setCustomer(null)}
            >
              <X className="size-3" /> {t("walkIn")}
            </button>
          ) : (
            <span className="text-muted-foreground text-xs">{t("walkInHint")}</span>
          )}
        </div>
        <div className="min-h-40 flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="text-muted-foreground grid h-full place-items-center gap-2 p-8 text-center text-sm">
              <ShoppingBag className="size-8 opacity-40" />
              {t("empty")}
            </div>
          ) : (
            <ul className="divide-y">
              <AnimatePresence initial={false}>
                {cart.map((l, i) => (
                  <motion.li
                    key={l.product.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid gap-1.5 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-tight">{l.product.name}</span>
                      <span className="text-sm font-semibold tabular-nums">{f.money(amounts[i]!.subtotal)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        aria-label={t("less")}
                        onClick={() => setCart((c) => c.map((x) => (x.product.id === l.product.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}
                      >
                        <Minus />
                      </Button>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        aria-label={t("qty")}
                        className="h-7 w-16 text-center tabular-nums"
                        value={l.qty}
                        onChange={(e) => setCart((c) => c.map((x) => (x.product.id === l.product.id ? { ...x, qty: Number(e.target.value) || 0 } : x)))}
                      />
                      <Button variant="outline" size="icon" className="size-7" aria-label={t("more")} onClick={() => add(l.product)}>
                        <Plus />
                      </Button>
                      <span className="text-muted-foreground ml-1 text-xs tabular-nums">× {f.money(l.price)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-7"
                        aria-label={t("remove")}
                        onClick={() => setCart((c) => c.filter((x) => x.product.id !== l.product.id))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
        <div className="grid gap-3 border-t p-3">
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("subtotal")}</dt>
              <dd className="tabular-nums">{f.money(totals.subtotal)}</dd>
            </div>
            {Number(totals.sscl) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">SSCL</dt>
                <dd className="tabular-nums">{f.money(totals.sscl)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("vat")}</dt>
              <dd className="tabular-nums">{f.money(totals.tax)}</dd>
            </div>
            <div className="flex justify-between pt-1 text-2xl font-bold">
              <dt>{t("total")}</dt>
              <dd className="tabular-nums" data-testid="pos-total">
                {f.money(total)}
              </dd>
            </div>
          </dl>
          <div role="radiogroup" aria-label={t("method")} className="grid grid-cols-4 gap-1.5">
            {PAYMENT_METHODS.filter((m) => m !== "cheque").map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={cn(
                  "h-8 rounded-md border text-xs font-medium",
                  method === m ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:text-foreground",
                  m === "bank_transfer" && "col-span-2",
                )}
              >
                {tm(m)}
              </button>
            ))}
          </div>
          {method === "cash" && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder={t("tendered")}
                aria-label={t("tendered")}
                className="h-10 text-lg tabular-nums"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
              />
              <div className="grid min-w-28 text-right">
                <span className="text-muted-foreground text-xs">{t("change")}</span>
                <span className="font-semibold tabular-nums">{f.money(change)}</span>
              </div>
            </div>
          )}
          <Button size="lg" className="h-12 text-base" disabled={cart.length === 0 || cart.some((l) => !(l.qty > 0))} loading={saving} onClick={complete}>
            {t("charge", { amount: f.money(total) })}
          </Button>
        </div>
      </Card>

      <Dialog open={!!result} onOpenChange={(o) => !o && (setResult(null), searchRef.current?.focus())}>
        <DialogContent closeLabel={tc("close")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-success size-5" /> {t("done")}
            </DialogTitle>
          </DialogHeader>
          {result && (
            <div className="grid gap-2 text-center">
              <p className="text-muted-foreground font-mono text-sm">{result.number}</p>
              <p className="text-3xl font-bold tabular-nums">{f.money(result.total)}</p>
              {result.change > 0 && <p className="text-success text-lg font-semibold">{t("giveChange", { amount: f.money(result.change) })}</p>}
            </div>
          )}
          <DialogFooter>
            {result && (
              <Button variant="outline" asChild>
                <Link href={`/sales/invoices/${result.invoiceId}`}>
                  <Printer /> {t("receipt")}
                </Link>
              </Button>
            )}
            <Button onClick={() => setResult(null)}>{t("newSale")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
