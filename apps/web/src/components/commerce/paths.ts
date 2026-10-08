import type { OrderKind } from "@/lib/types";

export const orderPath = (kind: OrderKind, id: string) => (kind === "purchase" ? `/purchasing/orders/${id}` : `/sales/orders/${id}`);
export const ordersListPath = (kind: OrderKind) => (kind === "purchase" ? "/purchasing" : kind === "quotation" ? "/sales/quotations" : "/sales");
export const invoicePath = (kind: "sales" | "purchase", id: string) => (kind === "purchase" ? `/purchasing/bills/${id}` : `/sales/invoices/${id}`);
export const notePath = (kind: "credit" | "debit", id: string) => (kind === "debit" ? `/purchasing/returns/${id}` : `/sales/returns/${id}`);
