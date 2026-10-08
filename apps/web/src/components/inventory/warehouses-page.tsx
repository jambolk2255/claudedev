"use client";

import { warehouseUpdateSchema } from "@stockflow/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Star, Warehouse as WarehouseIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LocationPicker } from "@/components/maps/location-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Warehouse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Draft {
  name: string;
  code: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  active: boolean;
}

const blank: Draft = { name: "", code: "", address: "", latitude: null, longitude: null, isDefault: false, active: true };

function WarehouseSheet({ open, onOpenChange, warehouse }: { open: boolean; onOpenChange: (v: boolean) => void; warehouse: Warehouse | null }) {
  const t = useTranslations("inventory.warehouses");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(blank);
  useEffect(() => {
    if (open)
      setD(
        warehouse
          ? {
              name: warehouse.name,
              code: warehouse.code,
              address: warehouse.address ?? "",
              latitude: warehouse.latitude === null ? null : Number(warehouse.latitude),
              longitude: warehouse.longitude === null ? null : Number(warehouse.longitude),
              isDefault: warehouse.isDefault,
              active: warehouse.active,
            }
          : blank,
      );
  }, [open, warehouse]);

  const save = useMutation({
    mutationFn: () => {
      const body = warehouseUpdateSchema.parse(d);
      return api(warehouse ? `/warehouses/${warehouse.id}` : "/warehouses", { method: warehouse ? "PUT" : "POST", body });
    },
    onSuccess: () => {
      toast.success(t("saved"));
      void qc.invalidateQueries({ queryKey: ["warehouses"] });
      void qc.invalidateQueries({ queryKey: ["organization", "overview"] });
      onOpenChange(false);
    },
    onError: (e) => (e instanceof Error && e.name === "ZodError" ? toast.error(t("invalid")) : handleFormError(e)),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={warehouse ? t("edit") : t("new")}
        closeLabel={tc("close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              {tc("save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field label={t("name")} htmlFor="wh-name">
              <Input id="wh-name" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </Field>
            <Field label={t("code")} htmlFor="wh-code" hint={t("codeHint")}>
              <Input
                id="wh-code"
                className="font-mono uppercase"
                maxLength={12}
                value={d.code}
                onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })}
              />
            </Field>
          </div>
          <Field label={t("address")} htmlFor="wh-address" optional={tc("optional")}>
            <Input id="wh-address" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t("location")}</span>
            <LocationPicker
              idPrefix="wh"
              value={d.latitude !== null && d.longitude !== null ? { lat: d.latitude, lng: d.longitude } : null}
              onChange={(v) => setD({ ...d, latitude: v?.lat ?? null, longitude: v?.lng ?? null })}
            />
          </div>
          <label htmlFor="wh-default" className="flex items-center justify-between rounded-md border p-3 text-sm font-medium">
            {t("default")}
            <Switch id="wh-default" checked={d.isDefault} onCheckedChange={(v) => setD({ ...d, isDefault: v, active: v ? true : d.active })} />
          </label>
          <label htmlFor="wh-active" className="flex items-center justify-between rounded-md border p-3 text-sm font-medium">
            <span className="grid gap-0.5">
              {t("active")}
              <span className="text-muted-foreground text-xs font-normal">{t("activeHint")}</span>
            </span>
            <Switch id="wh-active" checked={d.active} disabled={d.isDefault} onCheckedChange={(v) => setD({ ...d, active: v })} />
          </label>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function WarehousesPage() {
  const t = useTranslations("inventory.warehouses");
  const f = useFormat();
  const can = useCan();
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [open, setOpen] = useState(false);
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        {can("warehouses.manage") && (
          <Button size="sm" onClick={() => (setEditing(null), setOpen(true))}>
            <Plus /> {t("new")}
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {warehouses.isPending
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)
          : warehouses.data?.map((w) => (
              <Card key={w.id} className={cn("flex flex-col p-5", !w.active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-content-center rounded-md">
                    <WarehouseIcon className="size-5" />
                  </span>
                  <div className="grid min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {w.name}
                      {w.isDefault && (
                        <Badge>
                          <Star /> {t("defaultBadge")}
                        </Badge>
                      )}
                      {!w.active && <Badge variant="outline">{t("inactive")}</Badge>}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">{w.code}</span>
                  </div>
                  {can("warehouses.manage") && (
                    <Button variant="ghost" size="icon" aria-label={t("edit")} onClick={() => (setEditing(w), setOpen(true))}>
                      <Pencil />
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground mt-3 line-clamp-2 min-h-10 text-sm">{w.address || t("noAddress")}</p>
                <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
                  <span>
                    <span className="font-semibold tabular-nums">{f.qty(w.products)}</span> <span className="text-muted-foreground">{t("products")}</span>
                    <span className="text-muted-foreground mx-1.5">·</span>
                    <span className="font-semibold tabular-nums">{f.qty(w.units)}</span> <span className="text-muted-foreground">{t("units")}</span>
                  </span>
                  {w.latitude && w.longitude && (
                    <a
                      href={`https://www.google.com/maps?q=${w.latitude},${w.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary flex items-center gap-1 text-xs hover:underline"
                    >
                      <MapPin className="size-3.5" /> {t("map")}
                    </a>
                  )}
                </div>
              </Card>
            ))}
      </div>
      <WarehouseSheet open={open} onOpenChange={setOpen} warehouse={editing} />
    </>
  );
}
