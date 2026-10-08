import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { PASSWORD, bootTestApp, mobile } from "./helpers";

type Method = "get" | "post" | "put" | "patch" | "delete";

describe("Inventory (e2e)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  const as = (token: string) => (method: Method, url: string, body?: object) => {
    const req = mobile(app, method, url, token);
    return body ? req.send(body) : req;
  };

  async function setupOrg(email: string, valuation: "fifo" | "weighted_average") {
    const reg = await mobile(app, "post", "/auth/register").send({ companyName: `Org ${email}`, name: "Owner Person", email, password: PASSWORD });
    const call = as(reg.body.tokens.accessToken);
    const steps: Record<string, object> = {
      company: { name: `Org ${email}` },
      industry: { industry: "pharmacy" },
      modules: { mode: "advanced", modules: ["inventory", "multiWarehouse", "batches"] },
      finance: {
        currency: "LKR",
        fiscalYearStartMonth: 4,
        vatRegistered: false,
        vatRate: 18,
        ssclEnabled: false,
        ssclRate: 2.5,
        valuationMethod: valuation,
        allowNegativeStock: false,
      },
      warehouses: {
        warehouses: [
          { name: "Main", code: "MAIN", isDefault: true },
          { name: "Kandy", code: "KDY" },
        ],
      },
    };
    for (const [k, v] of Object.entries(steps)) expect((await call("put", `/onboarding/${k}`, v)).status).toBe(200);
    expect((await call("post", "/onboarding/complete", {})).status).toBe(200);
    const warehouses = (await call("get", "/warehouses")).body as { id: string; code: string }[];
    return {
      call,
      token: reg.body.tokens.accessToken as string,
      main: warehouses.find((w) => w.code === "MAIN")!.id,
      kandy: warehouses.find((w) => w.code === "KDY")!.id,
    };
  }

  const level = async (productId: string, warehouseId: string) =>
    Number((await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } }))?.quantity ?? 0);

  let A: Awaited<ReturnType<typeof setupOrg>>;
  let B: Awaited<ReturnType<typeof setupOrg>>;
  let panadol: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootTestApp());
    A = await setupOrg("avg@inv.lk", "weighted_average");
    B = await setupOrg("fifo@inv.lk", "fifo");
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("creates products with generated SKUs and rejects duplicates", async () => {
    const res = await A.call("post", "/products", { name: "Panadol 500mg", costPrice: 100, sellPrice: 150, reorderLevel: 50 });
    expect(res.status).toBe(201);
    expect(res.body.sku).toBe("P-0001");
    panadol = res.body.id;
    expect((await A.call("post", "/products", { name: "Other", sku: "P-0001" })).status).toBe(409);
  });

  it("values receipts and issues at weighted average cost", async () => {
    const in1 = await A.call("post", "/stock/documents", {
      type: "stock_in",
      warehouseId: A.main,
      lines: [{ productId: panadol, quantity: 10, unitCost: 100 }],
    });
    expect(in1.status).toBe(201);
    expect(in1.body.number).toMatch(/^SIN-\d{4}-00001$/);
    await A.call("post", "/stock/documents", { type: "stock_in", warehouseId: A.main, lines: [{ productId: panadol, quantity: 10, unitCost: 200 }] });

    const out = await A.call("post", "/stock/documents", {
      type: "stock_out",
      warehouseId: A.main,
      reason: "sale",
      lines: [{ productId: panadol, quantity: 5 }],
    });
    expect(out.status).toBe(201);
    expect(Number(out.body.movements[0].unitCost)).toBe(150);
    expect(Number(out.body.movements[0].balanceAfter)).toBe(15);
    expect(Number(out.body.totalValue)).toBe(750);
    expect(await level(panadol, A.main)).toBe(15);
  });

  it("rejects issues beyond available stock without writing anything", async () => {
    const before = await prisma.stockMovement.count({ where: { productId: panadol } });
    const res = await A.call("post", "/stock/documents", { type: "stock_out", warehouseId: A.main, lines: [{ productId: panadol, quantity: 99 }] });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INSUFFICIENT_STOCK", available: 15 });
    expect(await prisma.stockMovement.count({ where: { productId: panadol } })).toBe(before);
    expect(await level(panadol, A.main)).toBe(15);
  });

  it("posts adjustments and stock counts as variances", async () => {
    expect(
      (await A.call("post", "/stock/documents", { type: "adjustment", warehouseId: A.main, reason: "damaged", lines: [{ productId: panadol, quantity: -2 }] }))
        .status,
    ).toBe(201);
    const count = await A.call("post", "/stock/documents", { type: "count", warehouseId: A.main, lines: [{ productId: panadol, quantity: 20 }] });
    expect(count.status).toBe(201);
    expect(Number(count.body.lines[0].systemQuantity)).toBe(13);
    expect(count.body.movements[0]).toMatchObject({ type: "adjustment_in" });
    expect(Number(count.body.movements[0].quantity)).toBe(7);
    expect(await level(panadol, A.main)).toBe(20);
  });

  it("transfers stock in two steps at the same cost", async () => {
    const t = await A.call("post", "/stock/documents", {
      type: "transfer",
      warehouseId: A.main,
      toWarehouseId: A.kandy,
      lines: [{ productId: panadol, quantity: 5 }],
    });
    expect(t.status).toBe(201);
    expect(t.body.status).toBe("in_transit");
    expect(await level(panadol, A.main)).toBe(15);
    expect(await level(panadol, A.kandy)).toBe(0);

    const r = await A.call("post", `/stock/documents/${t.body.id}/receive`, {});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("received");
    expect(await level(panadol, A.kandy)).toBe(5);
    const [out, inn] = [
      r.body.movements.find((m: { type: string }) => m.type === "transfer_out"),
      r.body.movements.find((m: { type: string }) => m.type === "transfer_in"),
    ];
    expect(inn.unitCost).toBe(out.unitCost);
    expect((await A.call("post", `/stock/documents/${t.body.id}/receive`, {})).status).toBe(409);
  });

  it("never oversells under concurrent issues", async () => {
    const res = await Promise.all(
      Array.from({ length: 10 }, () =>
        A.call("post", "/stock/documents", { type: "stock_out", warehouseId: A.main, lines: [{ productId: panadol, quantity: 2 }] }),
      ),
    );
    const ok = res.filter((r) => r.status === 201).length;
    expect(ok).toBe(7);
    expect(res.filter((r) => r.status === 400).every((r) => r.body.code === "INSUFFICIENT_STOCK")).toBe(true);
    expect(await level(panadol, A.main)).toBe(1);
    // Every number is unique even under concurrency.
    const numbers = await prisma.stockDocument.findMany({ where: { warehouse: { id: A.main } }, select: { number: true } });
    expect(new Set(numbers.map((n) => n.number)).size).toBe(numbers.length);
  });

  it("values issues with FIFO layers", async () => {
    const p = (await B.call("post", "/products", { name: "FIFO item", sku: "FIFO-1" })).body.id;
    await B.call("post", "/stock/documents", { type: "stock_in", warehouseId: B.main, lines: [{ productId: p, quantity: 10, unitCost: 100 }] });
    await B.call("post", "/stock/documents", { type: "stock_in", warehouseId: B.main, lines: [{ productId: p, quantity: 10, unitCost: 200 }] });
    const out = await B.call("post", "/stock/documents", { type: "stock_out", warehouseId: B.main, lines: [{ productId: p, quantity: 15 }] });
    expect(Number(out.body.totalValue)).toBe(2000);
    const summary = (await B.call("get", "/stock/summary")).body;
    expect(summary.stockValue).toBe(1000);
  });

  it("requires batch numbers and picks first-expiry-first-out", async () => {
    const p = (await A.call("post", "/products", { name: "Amoxicillin", sku: "AMX", trackBatches: true, reorderLevel: 100 })).body.id;
    const missing = await A.call("post", "/stock/documents", { type: "stock_in", warehouseId: A.main, lines: [{ productId: p, quantity: 5 }] });
    expect(missing.body.code).toBe("BATCH_REQUIRED");

    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10);
    await A.call("post", "/stock/documents", {
      type: "stock_in",
      warehouseId: A.main,
      lines: [
        { productId: p, quantity: 5, unitCost: 10, batchNo: "LATE", expiryDate: later },
        { productId: p, quantity: 5, unitCost: 10, batchNo: "SOON", expiryDate: soon },
      ],
    });
    const out = await A.call("post", "/stock/documents", { type: "stock_out", warehouseId: A.main, lines: [{ productId: p, quantity: 7 }] });
    expect(out.status).toBe(201);
    const picked = out.body.movements.map((m: { batch: { batchNo: string }; quantity: string }) => [m.batch.batchNo, Number(m.quantity)]);
    expect(picked).toEqual([
      ["SOON", -5],
      ["LATE", -2],
    ]);

    const detail = (await A.call("get", `/products/${p}`)).body;
    expect(detail.onHand).toBe(3);
    expect(detail.batches.map((b: { batchNo: string }) => b.batchNo)).toEqual(["LATE"]);
  });

  it("raises low stock and expiry alerts", async () => {
    const alerts = (await A.call("get", "/stock/alerts")).body as { type: string; sku: string }[];
    expect(alerts).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "low_stock", sku: "P-0001" }), expect.objectContaining({ type: "low_stock", sku: "AMX" })]),
    );
    const low = (await A.call("get", "/products?stock=low")).body;
    expect(low.items.map((i: { sku: string }) => i.sku).sort()).toEqual(["AMX", "P-0001"]);
  });

  it("isolates organizations", async () => {
    expect((await B.call("get", `/products/${panadol}`)).status).toBe(404);
    const res = await B.call("post", "/stock/documents", { type: "stock_in", warehouseId: B.main, lines: [{ productId: panadol, quantity: 1 }] });
    expect(res.body.code).toBe("PRODUCT_INVALID");
    const cross = await B.call("post", "/stock/documents", { type: "stock_in", warehouseId: A.main, lines: [{ productId: panadol, quantity: 1 }] });
    expect(cross.body.code).toBe("WAREHOUSE_INVALID");
  });

  it("enforces permissions per document type", async () => {
    const roles = (await A.call("get", "/roles")).body as { id: string; key: string }[];
    const invite = await A.call("post", "/users/invitations", { email: "viewer@inv.lk", roleId: roles.find((r) => r.key === "viewer")!.id });
    const token = invite.body.inviteUrl.split("/invite/")[1];
    const joined = await mobile(app, "post", "/auth/accept-invite").send({ token, name: "View Only", password: PASSWORD });
    const viewer = as(joined.body.tokens.accessToken);
    expect((await viewer("get", "/stock/summary")).status).toBe(200);
    expect((await viewer("post", "/stock/documents", { type: "stock_in", warehouseId: A.main, lines: [{ productId: panadol, quantity: 1 }] })).status).toBe(
      403,
    );
    expect((await viewer("post", "/products", { name: "Nope" })).status).toBe(403);
  });

  it("manages customers and suppliers", async () => {
    const sup = await A.call("post", "/partners", { type: "supplier", name: "Lanka Pharma Distributors", phone: "+94112345678", paymentTermsDays: 30 });
    expect(sup.body.code).toBe("SUP-0001");
    const cus = await A.call("post", "/partners", { type: "customer", name: "City Hospital", creditLimit: 500000 });
    expect(cus.body.code).toBe("CUS-0001");
    // A customer can't be the supplier on a receipt.
    const bad = await A.call("post", "/stock/documents", {
      type: "stock_in",
      warehouseId: A.main,
      partnerId: cus.body.id,
      lines: [{ productId: panadol, quantity: 1 }],
    });
    expect(bad.body.code).toBe("PARTNER_INVALID");
    const list = await A.call("get", "/partners?type=supplier&search=lanka");
    expect(list.body.total).toBe(1);
  });

  it("keeps the ledger immutable at the database level", async () => {
    const m = await prisma.stockMovement.findFirstOrThrow({ where: { productId: panadol } });
    await expect(prisma.stockMovement.update({ where: { id: m.id }, data: { quantity: 999 } })).rejects.toThrow(/immutable/);
  });

  it("seeds sample data through the ledger when requested", async () => {
    const reg = await mobile(app, "post", "/auth/register").send({ companyName: "Demo Co", name: "Demo Owner", email: "demo@inv.lk", password: PASSWORD });
    const call = as(reg.body.tokens.accessToken);
    const steps: Record<string, object> = {
      company: { name: "Demo Co" },
      industry: { industry: "hardware" },
      modules: { mode: "simple", modules: ["inventory"] },
      finance: {
        currency: "LKR",
        fiscalYearStartMonth: 4,
        vatRegistered: true,
        vatRate: 18,
        ssclEnabled: false,
        ssclRate: 2.5,
        valuationMethod: "weighted_average",
        allowNegativeStock: false,
      },
      warehouses: { warehouses: [{ name: "Store", code: "ST", isDefault: true }] },
      data: { start: "demo" },
    };
    for (const [k, v] of Object.entries(steps)) await call("put", `/onboarding/${k}`, v);
    await call("post", "/onboarding/complete", {});
    const summary = (await call("get", "/stock/summary")).body;
    expect(summary.products).toBe(6);
    expect(summary.stockValue).toBeGreaterThan(0);
    // Ensure unauthenticated access is still blocked for the new endpoints.
    expect((await request(app.getHttpServer()).get("/api/v1/stock/summary")).status).toBe(401);
  });
});
