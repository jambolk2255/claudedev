import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, SYSTEM_ROLES, defaultModules, normalizeModules, passwordSchema, warehousesStepSchema } from "./index";

describe("permissions", () => {
  it("owner has every permission and every role uses known permissions", () => {
    expect(SYSTEM_ROLES.find((r) => r.key === "owner")?.permissions).toEqual(ALL_PERMISSIONS);
    for (const role of SYSTEM_ROLES) for (const p of role.permissions) expect(ALL_PERMISSIONS).toContain(p);
  });
});

describe("modules", () => {
  it("simple mode never includes advanced-only modules", () => {
    expect(normalizeModules("simple", ["inventory", "batches", "sales"])).toEqual(["inventory", "sales"]);
    expect(defaultModules("simple")).toContain("inventory");
  });
  it("core inventory module is always on", () => {
    expect(normalizeModules("advanced", [])).toEqual(["inventory"]);
  });
});

describe("validation", () => {
  it("rejects weak passwords", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase123").success).toBe(false);
    expect(passwordSchema.safeParse("Strong-Pass-123").success).toBe(true);
  });
  it("rejects duplicate warehouse codes", () => {
    const w = { name: "Main", code: "MAIN", isDefault: true };
    expect(warehousesStepSchema.safeParse({ warehouses: [w, w] }).success).toBe(false);
  });
});

import { productInputSchema, stockDocumentInputSchema } from "./inventory";

describe("inventory schemas", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  it("normalises SKUs and rejects max below reorder level", () => {
    expect(productInputSchema.parse({ name: "Panadol", sku: "pan-500" }).sku).toBe("PAN-500");
    expect(productInputSchema.safeParse({ name: "Panadol", reorderLevel: 10, maxLevel: 5 }).success).toBe(false);
  });

  it("validates each stock document type", () => {
    expect(stockDocumentInputSchema.safeParse({ type: "stock_in", warehouseId: id, lines: [{ productId: id, quantity: 5, unitCost: 10 }] }).success).toBe(true);
    expect(stockDocumentInputSchema.safeParse({ type: "stock_out", warehouseId: id, lines: [{ productId: id, quantity: -1 }] }).success).toBe(false);
    expect(
      stockDocumentInputSchema.safeParse({ type: "adjustment", warehouseId: id, reason: "damaged", lines: [{ productId: id, quantity: -2 }] }).success,
    ).toBe(true);
    expect(stockDocumentInputSchema.safeParse({ type: "transfer", warehouseId: id, toWarehouseId: id, lines: [{ productId: id, quantity: 1 }] }).success).toBe(
      false,
    );
    expect(
      stockDocumentInputSchema.safeParse({ type: "transfer", warehouseId: id, toWarehouseId: other, lines: [{ productId: id, quantity: 1 }] }).success,
    ).toBe(true);
  });

  it("rejects duplicate lines and too many decimals", () => {
    const dup = [
      { productId: id, quantity: 1 },
      { productId: id, quantity: 2 },
    ];
    expect(stockDocumentInputSchema.safeParse({ type: "count", warehouseId: id, lines: dup }).success).toBe(false);
    expect(stockDocumentInputSchema.safeParse({ type: "stock_in", warehouseId: id, lines: [{ productId: id, quantity: 1.00001 }] }).success).toBe(false);
  });
});

import { calcLine, journalInputSchema, paymentInputSchema, sumLines } from "./commerce";

describe("commerce maths and schemas", () => {
  it("applies discount, SSCL and VAT on value + SSCL", () => {
    // 10 × 100 = 1000, 10% discount → 900, SSCL 2.5% → 22.50, VAT 18% on 922.50 → 166.05
    expect(calcLine({ quantity: 10, unitPrice: 100, discountPct: 10, taxRate: 18 }, 2.5)).toEqual({
      subtotal: 900,
      discount: 100,
      sscl: 22.5,
      tax: 166.05,
      total: 1088.55,
    });
    expect(sumLines([calcLine({ quantity: 1, unitPrice: 0.1 }), calcLine({ quantity: 1, unitPrice: 0.2 })]).total).toBe(0.3);
  });

  it("requires cheque details and allocations within the amount", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const base = { kind: "receipt", partnerId: id, accountId: id, amount: 100 };
    expect(paymentInputSchema.safeParse({ ...base, method: "cheque" }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ ...base, method: "cash", allocations: [{ invoiceId: id, amount: 150 }] }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ ...base, method: "cash", allocations: [{ invoiceId: id, amount: 100 }] }).success).toBe(true);
  });

  it("only accepts balanced journals with one side per line", () => {
    const a = "11111111-1111-4111-8111-111111111111";
    expect(
      journalInputSchema.safeParse({
        memo: "Test",
        lines: [
          { accountId: a, debit: 10 },
          { accountId: a, credit: 10 },
        ],
      }).success,
    ).toBe(true);
    expect(
      journalInputSchema.safeParse({
        memo: "Test",
        lines: [
          { accountId: a, debit: 10 },
          { accountId: a, credit: 9 },
        ],
      }).success,
    ).toBe(false);
    expect(
      journalInputSchema.safeParse({
        memo: "Test",
        lines: [
          { accountId: a, debit: 10, credit: 10 },
          { accountId: a, credit: 0 },
        ],
      }).success,
    ).toBe(false);
  });
});
