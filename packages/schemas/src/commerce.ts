import { z } from "zod";

const uuid = z.string().uuid();
const optionalUuid = uuid
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date.invalid");
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const money = z
  .number()
  .finite()
  .min(0)
  .max(10_000_000_000)
  .refine((v) => Math.round(v * 100) / 100 === v, "max_decimals_money");
const quantity = z
  .number()
  .finite()
  .positive()
  .max(1_000_000_000)
  .refine((v) => Math.round(v * 10_000) / 10_000 === v, "max_decimals");
const price = z
  .number()
  .finite()
  .min(0)
  .max(10_000_000_000)
  .refine((v) => Math.round(v * 10_000) / 10_000 === v, "max_decimals");
const discount = z.number().min(0).max(100).default(0);
const MAX_LINES = 300;

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface LineAmounts {
  subtotal: number;
  discount: number;
  sscl: number;
  tax: number;
  total: number;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Line maths shared by the web (live totals) and the API (stored amounts), so both always agree.
 * Sri Lanka: SSCL is levied on the value and VAT is charged on value + SSCL.
 */
export function calcLine(line: { quantity: number; unitPrice: number; discountPct?: number; taxRate?: number }, ssclRate = 0): LineAmounts {
  const gross = round2(line.quantity * line.unitPrice);
  const discountAmt = round2((gross * (line.discountPct ?? 0)) / 100);
  const subtotal = round2(gross - discountAmt);
  const sscl = round2((subtotal * ssclRate) / 100);
  const tax = round2(((subtotal + sscl) * (line.taxRate ?? 0)) / 100);
  return { subtotal, discount: discountAmt, sscl, tax, total: round2(subtotal + sscl + tax) };
}

export function sumLines(lines: LineAmounts[]): LineAmounts {
  return lines.reduce(
    (acc, l) => ({
      subtotal: round2(acc.subtotal + l.subtotal),
      discount: round2(acc.discount + l.discount),
      sscl: round2(acc.sscl + l.sscl),
      tax: round2(acc.tax + l.tax),
      total: round2(acc.total + l.total),
    }),
    { subtotal: 0, discount: 0, sscl: 0, tax: 0, total: 0 },
  );
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export const ORDER_KINDS = ["purchase", "quotation", "sales"] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];
export const ORDER_STATUSES = ["draft", "confirmed", "partial", "fulfilled", "closed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const tradeLineSchema = z.object({
  productId: uuid,
  description: text(300),
  quantity,
  unitPrice: price,
  discountPct: discount,
  taxRateId: optionalUuid,
});

export const orderInputSchema = z.object({
  kind: z.enum(ORDER_KINDS),
  partnerId: uuid,
  warehouseId: uuid,
  orderDate: dateString.optional(),
  expectedDate: dateString.optional().nullable(),
  reference: text(100),
  notes: text(2000),
  deliveryAddress: text(300),
  lines: z.array(tradeLineSchema).min(1).max(MAX_LINES),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

/** Receive (GRN) or deliver against an order. */
export const fulfilmentInputSchema = z.object({
  documentDate: dateString.optional(),
  reference: text(100),
  note: text(1000),
  lines: z
    .array(
      z.object({
        orderLineId: uuid,
        quantity,
        batchNo: text(50),
        expiryDate: dateString.optional().nullable(),
      }),
    )
    .min(1)
    .max(MAX_LINES),
});
export type FulfilmentInput = z.infer<typeof fulfilmentInputSchema>;

// ─── Invoices & bills ────────────────────────────────────────────────────────

export const INVOICE_KINDS = ["sales", "purchase"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const invoiceInputSchema = z
  .object({
    kind: z.enum(INVOICE_KINDS),
    partnerId: uuid,
    orderId: optionalUuid,
    invoiceDate: dateString.optional(),
    dueDate: dateString.optional().nullable(),
    supplierRef: text(60),
    notes: text(2000),
    /** Sales only: issue the stock from this warehouse at the same time (counter sales). */
    deliverFromWarehouseId: optionalUuid,
    overrideCreditLimit: z.boolean().default(false),
    lines: z
      .array(
        z.object({
          orderLineId: optionalUuid,
          productId: optionalUuid,
          description: text(300),
          quantity,
          unitPrice: price,
          discountPct: discount,
          taxRateId: optionalUuid,
        }),
      )
      .min(1)
      .max(MAX_LINES),
  })
  .refine((v) => v.lines.every((l) => l.productId || l.orderLineId || l.description), { path: ["lines"], message: "lines.descriptionRequired" });
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

// ─── Payments ────────────────────────────────────────────────────────────────

export const PAYMENT_KINDS = ["receipt", "payment"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_METHODS = ["cash", "bank_transfer", "cheque", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const allocationSchema = z.object({ invoiceId: uuid, amount: money.refine((v) => v > 0, "amount.positive") });

export const paymentInputSchema = z
  .object({
    kind: z.enum(PAYMENT_KINDS),
    partnerId: uuid,
    paymentDate: dateString.optional(),
    method: z.enum(PAYMENT_METHODS),
    accountId: uuid,
    amount: money.refine((v) => v > 0, "amount.positive"),
    reference: text(100),
    chequeNo: text(30),
    chequeDate: dateString.optional().nullable(),
    notes: text(1000),
    allocations: z.array(allocationSchema).max(200).default([]),
  })
  .refine((p) => p.method !== "cheque" || (p.chequeNo && p.chequeDate), { path: ["chequeNo"], message: "cheque.required" })
  .refine((p) => p.allocations.reduce((s, a) => s + a.amount, 0) <= p.amount + 0.001, { path: ["allocations"], message: "allocations.exceedAmount" })
  .refine((p) => new Set(p.allocations.map((a) => a.invoiceId)).size === p.allocations.length, { path: ["allocations"], message: "allocations.duplicate" });
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const allocateSchema = z.object({ allocations: z.array(allocationSchema).min(1).max(200) });

// ─── Returns & notes ─────────────────────────────────────────────────────────

export const RETURN_KINDS = ["outward", "inward"] as const;
export type ReturnKind = (typeof RETURN_KINDS)[number];

/** Return outward (to a supplier → debit note) or inward (from a customer → credit note). */
export const returnInputSchema = z.object({
  kind: z.enum(RETURN_KINDS),
  partnerId: uuid,
  warehouseId: uuid,
  invoiceId: optionalUuid,
  documentDate: dateString.optional(),
  reason: text(300),
  lines: z
    .array(
      z.object({
        productId: uuid,
        quantity,
        /** Value credited per unit; defaults to the invoice price or the product price. */
        unitPrice: price.optional(),
        taxRateId: optionalUuid,
        batchNo: text(50),
      }),
    )
    .min(1)
    .max(MAX_LINES),
});
export type ReturnInput = z.infer<typeof returnInputSchema>;

export const applyNoteSchema = z.object({ invoiceId: uuid, amount: money.refine((v) => v > 0, "amount.positive") });

// ─── Quick sale (POS) ────────────────────────────────────────────────────────

export const quickSaleSchema = z.object({
  warehouseId: uuid,
  partnerId: optionalUuid,
  lines: z
    .array(z.object({ productId: uuid, quantity, unitPrice: price.optional(), discountPct: discount }))
    .min(1)
    .max(MAX_LINES),
  payment: z
    .object({
      method: z.enum(PAYMENT_METHODS),
      accountId: uuid,
      /** Amount tendered; anything above the total is change and is not recorded. */
      tendered: money.optional(),
      chequeNo: text(30),
      chequeDate: dateString.optional().nullable(),
      reference: text(100),
    })
    .refine((p) => p.method !== "cheque" || (p.chequeNo && p.chequeDate), { path: ["chequeNo"], message: "cheque.required" }),
});
export type QuickSaleInput = z.infer<typeof quickSaleSchema>;

// ─── General ledger ──────────────────────────────────────────────────────────

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const accountInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9A-Z.-]{2,12}$/, "account.code"),
  name: z.string().trim().min(2).max(100),
  type: z.enum(ACCOUNT_TYPES),
  isCash: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const journalInputSchema = z
  .object({
    entryDate: dateString.optional(),
    memo: z.string().trim().min(2).max(300),
    lines: z
      .array(
        z
          .object({ accountId: uuid, partnerId: optionalUuid, debit: money.default(0), credit: money.default(0), memo: text(200) })
          .refine((l) => l.debit > 0 !== l.credit > 0, "journal.oneSide"),
      )
      .min(2)
      .max(100),
  })
  .refine((j) => Math.abs(j.lines.reduce((s, l) => s + l.debit - l.credit, 0)) < 0.005, { path: ["lines"], message: "journal.unbalanced" });
export type JournalInput = z.infer<typeof journalInputSchema>;

export type SystemAccountKey =
  | "cash"
  | "bank"
  | "ar"
  | "inventory"
  | "vat_input"
  | "ap"
  | "grni"
  | "vat_output"
  | "sscl"
  | "equity"
  | "retained"
  | "sales"
  | "sales_returns"
  | "cogs"
  | "inventory_adjustments"
  | "ppv"
  | "expenses";

/** Default chart of accounts created for every organization. */
export const DEFAULT_CHART: { code: string; name: string; type: AccountType; systemKey: SystemAccountKey; isCash?: boolean }[] = [
  { code: "1000", name: "Cash in hand", type: "asset", systemKey: "cash", isCash: true },
  { code: "1010", name: "Bank account", type: "asset", systemKey: "bank", isCash: true },
  { code: "1100", name: "Accounts receivable", type: "asset", systemKey: "ar" },
  { code: "1200", name: "Inventory", type: "asset", systemKey: "inventory" },
  { code: "1300", name: "VAT input", type: "asset", systemKey: "vat_input" },
  { code: "2000", name: "Accounts payable", type: "liability", systemKey: "ap" },
  { code: "2100", name: "Goods received not invoiced", type: "liability", systemKey: "grni" },
  { code: "2200", name: "VAT output", type: "liability", systemKey: "vat_output" },
  { code: "2210", name: "SSCL payable", type: "liability", systemKey: "sscl" },
  { code: "3000", name: "Owner's equity", type: "equity", systemKey: "equity" },
  { code: "3900", name: "Retained earnings", type: "equity", systemKey: "retained" },
  { code: "4000", name: "Sales", type: "income", systemKey: "sales" },
  { code: "4100", name: "Sales returns", type: "income", systemKey: "sales_returns" },
  { code: "5000", name: "Cost of goods sold", type: "expense", systemKey: "cogs" },
  { code: "5100", name: "Inventory adjustments", type: "expense", systemKey: "inventory_adjustments" },
  { code: "5200", name: "Purchase price variance", type: "expense", systemKey: "ppv" },
  { code: "6000", name: "General expenses", type: "expense", systemKey: "expenses" },
];
