/** Response shapes of the inventory API (decimals arrive as strings). */
type Dec = string | number;

export interface Ref {
  id: string;
  name: string;
  code?: string;
}

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  type: "stock" | "service";
  costPrice: Dec;
  sellPrice: Dec;
  reorderLevel: Dec | null;
  maxLevel: Dec | null;
  trackBatches: boolean;
  active: boolean;
  categoryId: string | null;
  unitId: string | null;
  taxRateId: string | null;
  description: string | null;
  category: { id: string; name: string } | null;
  unit: { id: string; code: string } | null;
  onHand: number;
  stockValue: number;
}

export interface Movement {
  id: string;
  type: "opening" | "stock_in" | "stock_out" | "adjustment_in" | "adjustment_out" | "transfer_out" | "transfer_in";
  quantity: Dec;
  unitCost: Dec;
  totalCost: Dec;
  balanceAfter: Dec;
  createdAt: string;
  product?: { id: string; sku: string; name: string };
  warehouse: { code: string; name?: string };
  batch: { batchNo: string; expiryDate?: string | null } | null;
  document: { id: string; number: string; type: string } | null;
  createdBy?: { name: string } | null;
}

export interface ProductDetail extends ProductListItem {
  taxRate: { id: string; code: string; rate: Dec } | null;
  levels: { warehouse: { id: string; name: string; code: string }; quantity: Dec; avgCost: Dec; value: Dec }[];
  batches: { id: string; batchNo: string; expiryDate: string | null; balances: { quantity: Dec; warehouse: { id: string; code: string } }[] }[];
  movements: Movement[];
}

export type StockDocType = "stock_in" | "stock_out" | "adjustment" | "count" | "transfer" | "opening";

export interface StockDocumentSummary {
  id: string;
  type: StockDocType;
  status: "posted" | "in_transit" | "received";
  number: string;
  reference: string | null;
  reason: string | null;
  documentDate: string;
  totalValue: Dec;
  createdAt: string;
  warehouse: Ref;
  toWarehouse: Ref | null;
  partner: { id: string; name: string } | null;
  createdBy: { name: string } | null;
  _count: { lines: number };
}

export interface StockDocumentDetail extends Omit<StockDocumentSummary, "_count"> {
  note: string | null;
  receivedAt: string | null;
  lines: {
    id: string;
    lineNo: number;
    quantity: Dec;
    systemQuantity: Dec | null;
    unitCost: Dec | null;
    batchNo: string | null;
    expiryDate: string | null;
    note: string | null;
    product: { id: string; sku: string; name: string; unit: { code: string } | null };
  }[];
  movements: (Movement & { product: { sku: string } })[];
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  latitude: Dec | null;
  longitude: Dec | null;
  isDefault: boolean;
  active: boolean;
  products: number;
  units: number;
}

export interface Partner {
  id: string;
  type: "customer" | "supplier";
  code: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  taxNo: string | null;
  address: string | null;
  city: string | null;
  latitude: Dec | null;
  longitude: Dec | null;
  creditLimit: Dec | null;
  paymentTermsDays: number;
  notes: string | null;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  _count?: { products: number };
}
export interface Unit {
  id: string;
  code: string;
  name: string;
}
export interface TaxRate {
  id: string;
  code: string;
  name: string;
  rate: Dec;
}
