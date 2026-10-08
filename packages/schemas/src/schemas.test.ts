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
