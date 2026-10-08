/** Shapes returned by the StockFlow API (subset used by the app). */
export type Dec = string | number;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  locale: "en" | "si";
  organization: { id: string; name: string; modules: string[]; currency: string; onboardingCompleted: boolean };
  role: { id: string; key: string | null; name: string };
  permissions: string[];
  subscription: { status: string; planName: string; readOnly: boolean; blocked: boolean; daysLeft: number | null } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  type: "stock" | "service";
  costPrice: Dec;
  sellPrice: Dec;
  reorderLevel: Dec | null;
  trackBatches: boolean;
  taxRateId: string | null;
  unit: { id: string; code: string } | null;
  category: { id: string; name: string } | null;
  onHand: number;
  stockValue: number;
}

export interface ProductDetail extends Product {
  levels: { warehouse: { id: string; name: string; code: string }; quantity: Dec; avgCost: Dec; value: Dec }[];
  batches: { id: string; batchNo: string; expiryDate: string | null; balances: { quantity: Dec; warehouse: { id: string; code: string } }[] }[];
}

export interface StockSummary {
  products: number;
  stockValue: number;
  units: number;
  lowStock: number;
  outOfStock: number;
  expiring: number;
}

export interface StockAlert {
  type: "out_of_stock" | "low_stock" | "overstock" | "expiring" | "expired";
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  threshold: number | null;
  batchNo?: string;
  expiryDate?: string;
  warehouseName?: string;
}

export type OrderKind = "purchase" | "quotation" | "sales";
export type OrderStatus = "draft" | "confirmed" | "partial" | "fulfilled" | "closed" | "cancelled";

export interface OrderSummary {
  id: string;
  kind: OrderKind;
  number: string;
  status: OrderStatus;
  orderDate: string;
  expectedDate: string | null;
  total: Dec;
  partner: { id: string; name: string };
}

export interface OrderDetail extends OrderSummary {
  deliveryAddress: string | null;
  notes: string | null;
  warehouse: { id: string; name: string; code: string };
  partner: { id: string; name: string; phone: string | null } & OrderSummary["partner"];
  lines: {
    id: string;
    quantity: Dec;
    fulfilledQty: Dec;
    unitPrice: Dec;
    total: Dec;
    product: { id: string; sku: string; name: string; trackBatches: boolean; type: "stock" | "service"; unit: { code: string } | null };
  }[];
}

export interface TaxRate {
  id: string;
  code: string;
  rate: Dec;
}

export interface CashAccount {
  id: string;
  code: string;
  name: string;
  isCash: boolean;
  active: boolean;
}
