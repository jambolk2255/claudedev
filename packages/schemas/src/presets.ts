import type { ModuleKey } from "./modules";

export const INDUSTRIES = ["retail", "wholesale", "pharmacy", "hardware", "fmcg", "food", "manufacturing", "electronics", "apparel", "other"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export interface IndustryPreset {
  categories: string[];
  units: string[];
  suggestedModules: ModuleKey[];
  expiryAlertDays: number | null;
}

export const INDUSTRY_PRESETS: Record<Industry, IndustryPreset> = {
  retail: {
    categories: ["Groceries", "Household", "Personal care", "Stationery"],
    units: ["pcs", "kg", "g", "l", "pack"],
    suggestedModules: ["pos", "barcodes"],
    expiryAlertDays: 30,
  },
  wholesale: {
    categories: ["General goods", "Bulk items"],
    units: ["pcs", "box", "carton", "kg"],
    suggestedModules: ["maps", "multiWarehouse"],
    expiryAlertDays: 30,
  },
  pharmacy: {
    categories: ["Prescription", "OTC", "Surgical", "Supplements"],
    units: ["pcs", "strip", "box", "bottle"],
    suggestedModules: ["batches", "barcodes", "pos"],
    expiryAlertDays: 90,
  },
  hardware: {
    categories: ["Tools", "Electrical", "Plumbing", "Paint", "Building materials"],
    units: ["pcs", "m", "kg", "l", "box"],
    suggestedModules: ["barcodes"],
    expiryAlertDays: null,
  },
  fmcg: {
    categories: ["Beverages", "Snacks", "Dairy", "Personal care"],
    units: ["pcs", "pack", "carton", "case"],
    suggestedModules: ["maps", "batches", "multiWarehouse"],
    expiryAlertDays: 45,
  },
  food: {
    categories: ["Raw materials", "Ingredients", "Packaging", "Finished goods"],
    units: ["kg", "g", "l", "ml", "pcs"],
    suggestedModules: ["batches"],
    expiryAlertDays: 7,
  },
  manufacturing: {
    categories: ["Raw materials", "Work in progress", "Finished goods", "Spare parts"],
    units: ["pcs", "kg", "m", "l", "set"],
    suggestedModules: ["batches", "multiWarehouse", "approvals"],
    expiryAlertDays: null,
  },
  electronics: {
    categories: ["Mobile phones", "Accessories", "Computers", "Appliances"],
    units: ["pcs", "box", "set"],
    suggestedModules: ["serials", "barcodes"],
    expiryAlertDays: null,
  },
  apparel: { categories: ["Men", "Women", "Kids", "Accessories"], units: ["pcs", "pair", "set"], suggestedModules: ["barcodes", "pos"], expiryAlertDays: null },
  other: { categories: ["General"], units: ["pcs", "kg", "l"], suggestedModules: [], expiryAlertDays: 30 },
};

export const CURRENCIES = ["LKR", "USD", "EUR", "GBP", "INR", "AUD", "AED", "SGD", "JPY"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface TaxPreset {
  code: string;
  name: string;
  rate: number;
}

/** Sri Lanka defaults. Rates are editable in settings because they change with budgets. */
export const SRI_LANKA_TAX_PRESETS: TaxPreset[] = [
  { code: "VAT", name: "Value Added Tax", rate: 18 },
  { code: "SSCL", name: "Social Security Contribution Levy", rate: 2.5 },
  { code: "EXEMPT", name: "VAT Exempt", rate: 0 },
];

export const VALUATION_METHODS = ["fifo", "weighted_average"] as const;
export type ValuationMethod = (typeof VALUATION_METHODS)[number];

export const DEFAULT_DOCUMENT_PREFIXES = {
  purchaseOrder: "PO",
  grn: "GRN",
  supplierBill: "BILL",
  returnOutward: "RO",
  debitNote: "DN",
  quotation: "QT",
  salesOrder: "SO",
  deliveryNote: "DEL",
  invoice: "INV",
  receipt: "RCT",
  returnInward: "RI",
  creditNote: "CN",
  stockAdjustment: "ADJ",
  stockTransfer: "TRF",
} as const;
export type DocumentType = keyof typeof DEFAULT_DOCUMENT_PREFIXES;
export const DOCUMENT_TYPES = Object.keys(DEFAULT_DOCUMENT_PREFIXES) as DocumentType[];
