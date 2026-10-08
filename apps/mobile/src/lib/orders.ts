import type { OrderSummary } from "./types";

export const isOverdue = (o: Pick<OrderSummary, "status" | "expectedDate">) =>
  !!o.expectedDate && (o.status === "confirmed" || o.status === "partial") && new Date(o.expectedDate) < new Date(new Date().toISOString().slice(0, 10));

export const today = () => new Date().toISOString().slice(0, 10);

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Same pricing maths as the API: SSCL on the net amount, VAT on net + SSCL, rounded per line. */
export function calcLine(quantity: number, unitPrice: number, taxRate: number, ssclRate: number) {
  const subtotal = round2(quantity * unitPrice);
  const sscl = round2((subtotal * ssclRate) / 100);
  const tax = round2(((subtotal + sscl) * taxRate) / 100);
  return { subtotal, sscl, tax, total: round2(subtotal + sscl + tax) };
}
