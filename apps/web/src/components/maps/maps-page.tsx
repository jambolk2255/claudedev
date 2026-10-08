"use client";

import type { Paginated } from "@stockflow/schemas";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPinned, Truck, Users, Warehouse as WarehouseIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState } from "react";
import { EmptyState } from "@/components/data/list";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import type { Partner, Warehouse } from "@/lib/types";
import { cn } from "@/lib/utils";

const OverviewMap = dynamic(() => import("./overview-map"), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export interface MapPoint {
  id: string;
  kind: "warehouse" | "customer" | "supplier";
  name: string;
  detail?: string;
  lat: number;
  lng: number;
}

const KINDS = [
  { kind: "warehouse", icon: WarehouseIcon, dot: "bg-[#6d5bd0]" },
  { kind: "customer", icon: Users, dot: "bg-[#16a34a]" },
  { kind: "supplier", icon: Truck, dot: "bg-[#ea580c]" },
] as const;

/** Warehouses, customers and suppliers on one map. */
export function MapsPage() {
  const t = useTranslations("mapsPage");
  const can = useCan();
  const [visible, setVisible] = useState<Set<MapPoint["kind"]>>(new Set(["warehouse", "customer", "supplier"]));
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });
  const partners = (type: "customer" | "supplier", enabled: boolean) => ({
    queryKey: ["partners", "map", type],
    queryFn: () => api<Paginated<Partner>>(`/partners?type=${type}&pageSize=100`),
    enabled,
  });
  const customers = useQuery(partners("customer", can("sales.view")));
  const suppliers = useQuery(partners("supplier", can("purchasing.view")));

  const located = <T extends { latitude: unknown; longitude: unknown }>(xs: T[] = []) => xs.filter((x) => x.latitude != null && x.longitude != null);
  const points: MapPoint[] = [
    ...located(warehouses.data).map((w) => ({
      id: w.id,
      kind: "warehouse" as const,
      name: `${w.name} (${w.code})`,
      detail: w.address ?? undefined,
      lat: Number(w.latitude),
      lng: Number(w.longitude),
    })),
    ...located(customers.data?.items).map((p) => ({
      id: p.id,
      kind: "customer" as const,
      name: p.name,
      detail: [p.address, p.city].filter(Boolean).join(", "),
      lat: Number(p.latitude),
      lng: Number(p.longitude),
    })),
    ...located(suppliers.data?.items).map((p) => ({
      id: p.id,
      kind: "supplier" as const,
      name: p.name,
      detail: [p.address, p.city].filter(Boolean).join(", "),
      lat: Number(p.latitude),
      lng: Number(p.longitude),
    })),
  ];
  const shown = points.filter((p) => visible.has(p.kind));
  const toggle = (k: MapPoint["kind"]) =>
    setVisible((v) => {
      const n = new Set(v);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {KINDS.map(({ kind, icon: Icon, dot }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={visible.has(kind)}
            onClick={() => toggle(kind)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
              visible.has(kind) ? "bg-card text-foreground" : "text-muted-foreground opacity-60",
            )}
          >
            <span className={cn("size-2 rounded-full", dot)} />
            <Icon className="size-3.5" /> {t(`kinds.${kind}`)}
            <span className="text-muted-foreground text-xs tabular-nums">{points.filter((p) => p.kind === kind).length}</span>
          </button>
        ))}
      </div>
      {MAPS_KEY ? (
        <Card className="h-[65vh] overflow-hidden">
          <OverviewMap apiKey={MAPS_KEY} points={shown} openLabel={t("directions")} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <p className="text-muted-foreground border-b px-4 py-3 text-sm">{t("noKey")}</p>
          {shown.length === 0 ? (
            <EmptyState icon={MapPinned} title={t("emptyTitle")} body={t("emptyBody")} />
          ) : (
            <ul className="divide-y">
              {shown.map((p) => (
                <li key={`${p.kind}-${p.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={cn("size-2 rounded-full", KINDS.find((k) => k.kind === p.kind)!.dot)} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{p.name}</span>
                    {p.detail && <span className="text-muted-foreground"> · {p.detail}</span>}
                  </span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary flex items-center gap-1 whitespace-nowrap text-xs hover:underline"
                  >
                    {t("open")} <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {points.length === 0 && MAPS_KEY && <p className="text-muted-foreground text-sm">{t("emptyBody")}</p>}
    </div>
  );
}
