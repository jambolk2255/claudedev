import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "./onboarding";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const uuid = z.string().uuid();
const optionalUuid = uuid
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

/** Quantities and money: finite, at most 4 decimals, bounded. */
const decimal = (opts: { min?: number; positive?: boolean } = {}) => {
  let n = z.number().finite().max(1_000_000_000);
  if (opts.positive) n = n.positive();
  else if (opts.min !== undefined) n = n.min(opts.min);
  return n.refine((v) => Math.round(v * 10_000) / 10_000 === v, "max_decimals");
};

export const PRODUCT_TYPES = ["stock", "service"] as const;

export const productInputSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9._-]{0,39}$/, "sku.invalid")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    name: z.string().trim().min(2).max(200),
    description: text(2000),
    barcode: text(64),
    type: z.enum(PRODUCT_TYPES).default("stock"),
    categoryId: optionalUuid,
    unitId: optionalUuid,
    taxRateId: optionalUuid,
    costPrice: decimal({ min: 0 }).default(0),
    sellPrice: decimal({ min: 0 }).default(0),
    reorderLevel: decimal({ min: 0 }).nullable().optional(),
    maxLevel: decimal({ min: 0 }).nullable().optional(),
    trackBatches: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((p) => p.maxLevel == null || p.reorderLevel == null || p.maxLevel >= p.reorderLevel, { path: ["maxLevel"], message: "maxLevel.belowReorder" });
export type ProductInput = z.infer<typeof productInputSchema>;

export const categoryInputSchema = z.object({ name: z.string().trim().min(1).max(100), parentId: optionalUuid });
export const unitInputSchema = z.object({ code: z.string().trim().min(1).max(12), name: z.string().trim().min(1).max(50) });

export const PARTNER_TYPES = ["customer", "supplier"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const partnerInputSchema = z.object({
  type: z.enum(PARTNER_TYPES),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9._-]{1,20}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(2).max(200),
  contactName: text(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  phone: text(30),
  taxNo: text(50),
  address: text(300),
  city: text(100),
  latitude: latitudeSchema.nullable().optional(),
  longitude: longitudeSchema.nullable().optional(),
  creditLimit: decimal({ min: 0 }).nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(0),
  notes: text(2000),
  active: z.boolean().default(true),
});
export type PartnerInput = z.infer<typeof partnerInputSchema>;

export const warehouseUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,12}$/),
  address: text(300),
  latitude: latitudeSchema.nullable().optional(),
  longitude: longitudeSchema.nullable().optional(),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

// ─── Stock documents ───────────────────────────────────────────────────────────

export const STOCK_DOCUMENT_TYPES = ["stock_in", "stock_out", "adjustment", "count", "transfer"] as const;
export type StockDocumentType = (typeof STOCK_DOCUMENT_TYPES)[number];

export const ADJUSTMENT_REASONS = ["damaged", "lost", "expired", "found", "correction", "sample", "other"] as const;
export const STOCK_OUT_REASONS = ["sale", "internal_use", "return_to_supplier", "write_off", "other"] as const;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date.invalid");
const batchNo = z
  .string()
  .trim()
  .max(50)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const lineBase = { productId: uuid, batchNo, note: text(300) };
const header = {
  warehouseId: uuid,
  documentDate: dateString.optional(),
  reference: text(100),
  note: text(1000),
};

const MAX_LINES = 500;

/** One product+batch per document keeps the ledger and counts unambiguous. */
const uniqueLines = <T extends { productId: string; batchNo: string | null }>(lines: T[]) =>
  new Set(lines.map((l) => `${l.productId}|${l.batchNo ?? ""}`)).size === lines.length;
const uniqueMsg = { message: "lines.duplicate", path: ["lines"] };

export const stockInSchema = z.object({
  type: z.literal("stock_in"),
  ...header,
  partnerId: optionalUuid,
  lines: z
    .array(
      z.object({ ...lineBase, quantity: decimal({ positive: true }), unitCost: decimal({ min: 0 }).optional(), expiryDate: dateString.optional().nullable() }),
    )
    .min(1)
    .max(MAX_LINES)
    .refine(uniqueLines, uniqueMsg),
});

export const stockOutSchema = z.object({
  type: z.literal("stock_out"),
  ...header,
  partnerId: optionalUuid,
  reason: z.enum(STOCK_OUT_REASONS).default("other"),
  lines: z
    .array(z.object({ ...lineBase, quantity: decimal({ positive: true }) }))
    .min(1)
    .max(MAX_LINES)
    .refine(uniqueLines, uniqueMsg),
});

export const adjustmentSchema = z.object({
  type: z.literal("adjustment"),
  ...header,
  reason: z.enum(ADJUSTMENT_REASONS),
  lines: z
    .array(
      z.object({
        ...lineBase,
        /** Signed: positive adds stock, negative removes it. */
        quantity: decimal().refine((v) => v !== 0, "quantity.zero"),
        unitCost: decimal({ min: 0 }).optional(),
        expiryDate: dateString.optional().nullable(),
      }),
    )
    .min(1)
    .max(MAX_LINES)
    .refine(uniqueLines, uniqueMsg),
});

export const countSchema = z.object({
  type: z.literal("count"),
  ...header,
  lines: z
    .array(z.object({ ...lineBase, quantity: decimal({ min: 0 }) }))
    .min(1)
    .max(MAX_LINES)
    .refine(uniqueLines, uniqueMsg),
});

export const transferSchema = z
  .object({
    type: z.literal("transfer"),
    ...header,
    toWarehouseId: uuid,
    lines: z
      .array(z.object({ ...lineBase, quantity: decimal({ positive: true }) }))
      .min(1)
      .max(MAX_LINES)
      .refine(uniqueLines, uniqueMsg),
  })
  .refine((d) => d.toWarehouseId !== d.warehouseId, { path: ["toWarehouseId"], message: "transfer.sameWarehouse" });

export const stockDocumentInputSchema = z.union([stockInSchema, stockOutSchema, adjustmentSchema, countSchema, transferSchema]);
export type StockDocumentInput = z.infer<typeof stockDocumentInputSchema>;

/** Permission needed to post each document type. */
export const STOCK_DOCUMENT_PERMISSIONS = {
  stock_in: "inventory.stock_in",
  stock_out: "inventory.stock_out",
  adjustment: "inventory.adjust",
  count: "inventory.count",
  transfer: "inventory.transfer",
} as const satisfies Record<StockDocumentType, string>;

/** Numbering series used by each document type. */
export const STOCK_DOCUMENT_SEQUENCES = {
  stock_in: "stockIn",
  stock_out: "stockOut",
  adjustment: "stockAdjustment",
  count: "stockCount",
  transfer: "stockTransfer",
} as const;

export type StockAlertType = "out_of_stock" | "low_stock" | "overstock" | "expiring" | "expired";

export interface StockAlert {
  type: StockAlertType;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  threshold: number | null;
  batchNo?: string;
  expiryDate?: string;
  warehouseId?: string;
  warehouseName?: string;
}

export interface StockSummary {
  products: number;
  stockValue: number;
  units: number;
  lowStock: number;
  outOfStock: number;
  expiring: number;
  byWarehouse: { warehouseId: string; name: string; code: string; value: number; units: number }[];
}
