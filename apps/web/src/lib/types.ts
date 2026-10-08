/** Response shapes of the inventory API (decimals arrive as strings). */
export type Dec = string | number;

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
  type:
    | "opening"
    | "stock_in"
    | "stock_out"
    | "adjustment_in"
    | "adjustment_out"
    | "transfer_out"
    | "transfer_in"
    | "purchase_in"
    | "sale_out"
    | "return_out"
    | "return_in";
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

export type StockDocType = "stock_in" | "stock_out" | "adjustment" | "count" | "transfer" | "opening" | "grn" | "delivery" | "return_outward" | "return_inward";

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

// ─── Commerce & finance ──────────────────────────────────────────────────────

export type OrderKind = "purchase" | "quotation" | "sales";
export type OrderStatus = "draft" | "confirmed" | "partial" | "fulfilled" | "closed" | "cancelled";
export type InvoiceStatus = "open" | "partially_paid" | "paid" | "void";

export interface OrderSummary {
  id: string;
  kind: OrderKind;
  number: string;
  status: OrderStatus;
  orderDate: string;
  expectedDate: string | null;
  reference: string | null;
  total: Dec;
  createdAt: string;
  partner: { id: string; name: string };
  warehouse: { code: string };
  _count: { lines: number };
}

export interface OrderDetail extends Omit<OrderSummary, "partner" | "warehouse" | "_count"> {
  notes: string | null;
  deliveryAddress: string | null;
  subtotal: Dec;
  discountTotal: Dec;
  taxTotal: Dec;
  ssclTotal: Dec;
  trackingToken: string | null;
  approvedAt: string | null;
  partnerId: string;
  warehouseId: string;
  partner: { id: string; code: string; name: string; phone: string | null; email: string | null; creditLimit: Dec | null; paymentTermsDays: number };
  warehouse: { id: string; name: string; code: string };
  convertedFrom: { id: string; number: string } | null;
  convertedTo: { id: string; number: string }[];
  lines: {
    id: string;
    lineNo: number;
    productId: string;
    description: string | null;
    quantity: Dec;
    fulfilledQty: Dec;
    invoicedQty: Dec;
    unitPrice: Dec;
    discountPct: Dec;
    taxRateId: string | null;
    taxRate: Dec;
    subtotal: Dec;
    tax: Dec;
    total: Dec;
    product: { id: string; sku: string; name: string; trackBatches: boolean; type: "stock" | "service"; unit: { code: string } | null };
  }[];
  stockDocuments: { id: string; number: string; type: string; documentDate: string; totalValue: Dec; createdAt: string }[];
  invoices: { id: string; number: string; kind: string; invoiceDate: string; total: Dec; amountPaid: Dec; status: InvoiceStatus; createdAt: string }[];
}

export interface InvoiceSummary {
  id: string;
  kind: "sales" | "purchase";
  number: string;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  supplierRef: string | null;
  total: Dec;
  amountPaid: Dec;
  createdAt: string;
  partner: { id: string; name: string };
  order: { id: string; number: string } | null;
}

export interface InvoiceDetail extends Omit<InvoiceSummary, "partner"> {
  partnerId: string;
  subtotal: Dec;
  discountTotal: Dec;
  taxTotal: Dec;
  ssclTotal: Dec;
  notes: string | null;
  partner: Partner;
  lines: {
    id: string;
    lineNo: number;
    description: string;
    quantity: Dec;
    unitPrice: Dec;
    discountPct: Dec;
    taxRate: Dec;
    subtotal: Dec;
    tax: Dec;
    total: Dec;
    product: { id: string; sku: string; name: string; unit: { code: string } | null } | null;
  }[];
  allocations: {
    id: string;
    amount: Dec;
    createdAt: string;
    payment: { id: string; number: string; paymentDate: string; method: string } | null;
    note: { id: string; number: string; noteDate: string } | null;
  }[];
}

export interface PaymentSummary {
  id: string;
  kind: "receipt" | "payment";
  number: string;
  paymentDate: string;
  method: "cash" | "bank_transfer" | "cheque" | "card";
  amount: Dec;
  amountAllocated: Dec;
  status: "posted" | "bounced";
  reference: string | null;
  chequeNo: string | null;
  chequeDate: string | null;
  chequeStatus: "pending" | "cleared" | "bounced" | null;
  partner: { id: string; name: string };
  account: { id: string; code: string; name: string };
}

export interface NoteSummary {
  id: string;
  kind: "credit" | "debit";
  number: string;
  noteDate: string;
  reason: string | null;
  subtotal: Dec;
  taxTotal: Dec;
  total: Dec;
  amountApplied: Dec;
  status: "open" | "applied";
  partner: { id: string; name: string };
  invoice: { id: string; number: string } | null;
  stockDocument: { id: string; number: string } | null;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  systemKey: string | null;
  isCash: boolean;
  active: boolean;
  balance?: number;
  debit?: number;
  credit?: number;
}
