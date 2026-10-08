"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TaxRate } from "@/lib/types";

/** VAT-type rates for line selection, plus the SSCL rate (sales only) when it is active. */
export function useTaxes(kind: "sales" | "purchase") {
  const q = useQuery({ queryKey: ["tax-rates"], queryFn: () => api<TaxRate[]>("/tax-rates") });
  const all = q.data ?? [];
  const sscl = all.find((t) => t.code === "SSCL");
  return { taxRates: all.filter((t) => t.code !== "SSCL"), ssclRate: kind === "sales" && sscl ? Number(sscl.rate) : 0, ready: q.isSuccess };
}
