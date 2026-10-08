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
