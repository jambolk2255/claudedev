import { TENANT_MODELS } from "./prisma.service";

describe("tenant scoping", () => {
  it("covers every model with an organizationId column", () => {
    for (const model of [
      "User",
      "Role",
      "Warehouse",
      "Product",
      "Partner",
      "StockLevel",
      "StockMovement",
      "StockDocument",
      "Batch",
      "BatchBalance",
      "CostLayer",
    ]) {
      expect(TENANT_MODELS.has(model)).toBe(true);
    }
    // The organization itself and child rows reached through a parent are not tenant models.
    expect(TENANT_MODELS.has("Organization")).toBe(false);
    expect(TENANT_MODELS.has("StockDocumentLine")).toBe(false);
  });
});
