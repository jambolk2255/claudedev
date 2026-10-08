import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { Warehouse } from "./types";

/** Active warehouses with the default one preselected. */
export function useWarehouses() {
  const q = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });
  const active = (q.data ?? []).filter((w) => w.active);
  const [warehouseId, setWarehouseId] = useState("");
  useEffect(() => {
    if (!warehouseId && active.length) setWarehouseId((active.find((w) => w.isDefault) ?? active[0])!.id);
  }, [active, warehouseId]);
  return { warehouses: active, warehouseId, setWarehouseId };
}
