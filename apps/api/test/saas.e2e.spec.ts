import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import request from "supertest";
import { PASSWORD, WebClient, bootTestApp } from "./helpers";

process.env.SAAS_MODE = "true";
process.env.TRIAL_DAYS = "14";
process.env.PLATFORM_ADMIN_EMAILS = "ops@stockflow.lk";
process.env.PAYHERE_MERCHANT_ID = "1211149";
process.env.PAYHERE_MERCHANT_SECRET = "test-merchant-secret";
process.env.BANK_TRANSFER_DETAILS = "StockFlow (Pvt) Ltd · Commercial Bank · 1234567890";

const md5 = (v: string) => createHash("md5").update(v).digest("hex").toUpperCase();
const SECRET_HASH = md5("test-merchant-secret");
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

describe("SaaS: trials, plan limits, billing and the platform console (e2e)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let ops: WebClient;
  let tenant: WebClient;
  let tenantId: string;

  const notify = (fields: Record<string, string>) => request(app.getHttpServer()).post("/api/v1/billing/payhere/notify").type("form").send(fields);

  beforeAll(async () => {
    ({ app, prisma } = await bootTestApp());
    ops = new WebClient(app);
    tenant = new WebClient(app);
    await ops.send("post", "/auth/register", { companyName: "StockFlow Ops", name: "Ops Admin", email: "ops@stockflow.lk", password: PASSWORD });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("lets anyone sign up and starts a free trial on the Business plan", async () => {
    const status = await new WebClient(app).send("get", "/auth/setup-status");
    expect(status.body).toMatchObject({ signupOpen: true, saas: true, trialDays: 14 });

    const res = await tenant.send("post", "/auth/register", {
      companyName: "Kandy Hardware",
      name: "Sunil Silva",
      email: "sunil@kandyhw.lk",
      password: PASSWORD,
    });
    expect(res.status).toBe(201);
    tenantId = res.body.user.organization.id;
    expect(res.body.user.platformAdmin).toBe(false);
    expect(res.body.user.subscription).toMatchObject({ status: "trialing", planName: "Business", readOnly: false, daysLeft: 14 });

    const me = await ops.send("get", "/auth/me");
    expect(me.body.platformAdmin).toBe(true);
    expect(me.body.subscription).toBeNull();

    const billing = await tenant.send("get", "/billing");
    expect(billing.body.enabled).toBe(true);
    expect(billing.body.plans.map((p: { code: string }) => p.code)).toEqual(["starter", "business", "enterprise"]);
    expect(billing.body.usage).toEqual({ users: 1, warehouses: 0, products: 0 });
    expect(billing.body.payhere).toBe(true);
    expect(billing.body.bankDetails).toContain("Commercial Bank");
  });

  it("keeps the platform console for platform admins only", async () => {
    expect((await tenant.send("get", "/platform/summary")).status).toBe(403);
    const summary = await ops.send("get", "/platform/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.tenants).toBe(2);
    const tenants = await ops.send("get", "/platform/tenants?search=kandy");
    expect(tenants.body.items).toHaveLength(1);
    expect(tenants.body.items[0]).toMatchObject({ name: "Kandy Hardware", owner: { email: "sunil@kandyhw.lk" }, subscription: { status: "trialing" } });
  });

  it("enforces plan limits for warehouses, users and modules", async () => {
    const set = await ops.send("put", `/platform/tenants/${tenantId}/subscription`, {
      planCode: "starter",
      status: "active",
      interval: "month",
      periodEnd: inDays(20),
    });
    expect(set.status).toBe(200);

    expect((await tenant.send("post", "/warehouses", { name: "Main", code: "MAIN" })).status).toBe(201);
    const second = await tenant.send("post", "/warehouses", { name: "Branch", code: "BR1" });
    expect(second.status).toBe(403);
    expect(second.body.code).toBe("PLAN_LIMIT");

    const roles = await tenant.send("get", "/roles");
    const viewer = roles.body.find((r: { key: string }) => r.key === "viewer").id;
    expect((await tenant.send("post", "/users/invitations", { email: "a@kandyhw.lk", roleId: viewer })).status).toBe(201);
    expect((await tenant.send("post", "/users/invitations", { email: "b@kandyhw.lk", roleId: viewer })).status).toBe(201);
    // Re-inviting the same person doesn't use another seat; a fourth person does.
    expect((await tenant.send("post", "/users/invitations", { email: "b@kandyhw.lk", roleId: viewer })).status).toBe(201);
    const fourth = await tenant.send("post", "/users/invitations", { email: "c@kandyhw.lk", roleId: viewer });
    expect(fourth.body.code).toBe("PLAN_LIMIT");

    const org = await tenant.send("patch", "/organization", { mode: "advanced", modules: ["inventory", "sales", "finance", "reports"] });
    expect(org.body.modules).toEqual(["inventory", "sales"]);
  });

  it("takes a PayHere payment, verifies the signature and upgrades the plan", async () => {
    const checkout = await tenant.send("post", "/billing/checkout", { planCode: "business", interval: "month" });
    expect(checkout.status).toBe(201);
    const f = checkout.body.fields as Record<string, string>;
    expect(checkout.body.action).toBe("https://sandbox.payhere.lk/pay/checkout");
    expect(f).toMatchObject({ merchant_id: "1211149", amount: "7900.00", currency: "LKR", email: "sunil@kandyhw.lk", first_name: "Sunil", last_name: "Silva" });
    expect(f.order_id).toMatch(/^SF-\d{4}-\d{5}$/);
    expect(f.hash).toBe(md5(`1211149${f.order_id}7900.00LKR${SECRET_HASH}`));
    expect(f.notify_url).toBe("http://localhost:3000/api/v1/billing/payhere/notify");

    const base = {
      merchant_id: "1211149",
      order_id: f.order_id!,
      payment_id: "320025071278",
      payhere_amount: "7900.00",
      payhere_currency: "LKR",
      status_code: "2",
    };
    const forged = await notify({ ...base, md5sig: md5("forged") });
    expect(forged.status).toBe(403);
    const sig = md5(`1211149${f.order_id}7900.00LKR2${SECRET_HASH}`);
    expect((await notify({ ...base, md5sig: sig })).status).toBe(200);
    // Duplicate notifications are harmless.
    expect((await notify({ ...base, md5sig: sig })).status).toBe(200);

    const billing = await tenant.send("get", "/billing");
    expect(billing.body.subscription).toMatchObject({ status: "active", interval: "month", plan: { code: "business" } });
    const paid = billing.body.invoices.filter((i: { status: string }) => i.status === "paid");
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({ method: "payhere", amount: "7900.00" });
    // Paid on top of the remaining 20 days of the current period.
    const end = new Date(billing.body.subscription.currentPeriodEnd).getTime();
    expect(end).toBeGreaterThan(Date.now() + 45 * 86_400_000);

    expect((await tenant.send("post", "/warehouses", { name: "Branch", code: "BR1" })).status).toBe(201);
  });

  it("makes an expired company read-only but keeps its data and billing reachable", async () => {
    await ops.send("put", `/platform/tenants/${tenantId}/subscription`, { planCode: "business", status: "trialing", interval: "month", periodEnd: inDays(-2) });
    const me = await tenant.send("get", "/auth/me");
    expect(me.body.subscription).toMatchObject({ status: "expired", readOnly: true });

    const blocked = await tenant.send("post", "/products", { name: "Hammer 16oz", sellPrice: 1500 });
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe("SUBSCRIPTION_INACTIVE");
    expect((await tenant.send("get", "/products")).status).toBe(200);
    expect((await tenant.send("get", "/billing")).status).toBe(200);
  });

  it("accepts a bank transfer confirmed by the platform admin", async () => {
    const tooSmall = await tenant.send("post", "/billing/bank-transfer", { planCode: "starter", interval: "month", reference: "BOC slip 7781" });
    expect(tooSmall.status).toBe(409);
    expect(tooSmall.body.code).toBe("PLAN_TOO_SMALL");

    const transfer = await tenant.send("post", "/billing/bank-transfer", { planCode: "enterprise", interval: "year", reference: "BOC slip 7782" });
    expect(transfer.status).toBe(201);
    const pending = await ops.send("get", "/platform/invoices?status=pending");
    const row = pending.body.items.find((i: { number: string }) => i.number === transfer.body.number);
    expect(row).toMatchObject({ method: "bank_transfer", amount: "199000", reference: "BOC slip 7782", organization: { name: "Kandy Hardware" } });

    expect((await ops.send("post", `/platform/invoices/${row.id}/mark-paid`, { note: "Seen in bank statement" })).status).toBe(201);
    const billing = await tenant.send("get", "/billing");
    expect(billing.body.subscription).toMatchObject({ status: "active", interval: "year", plan: { code: "enterprise" }, state: { readOnly: false } });
    expect((await tenant.send("post", "/products", { name: "Hammer 16oz", sellPrice: 1500 })).status).toBe(201);

    const summary = await ops.send("get", "/platform/summary");
    expect(summary.body.mrr).toBeCloseTo(199000 / 12, 2);
    expect(summary.body.revenue30d.amount).toBe(206900);
  });

  it("suspends a company completely except billing", async () => {
    await ops.send("put", `/platform/tenants/${tenantId}/subscription`, {
      planCode: "enterprise",
      status: "suspended",
      interval: "year",
      periodEnd: inDays(300),
      reason: "Chargeback",
    });
    const res = await tenant.send("get", "/products");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_SUSPENDED");
    expect((await tenant.send("get", "/billing")).status).toBe(200);
    expect((await tenant.send("get", "/auth/me")).body.subscription).toMatchObject({ status: "suspended", blocked: true });

    // The operator's own company is never gated.
    expect((await ops.send("get", "/products")).status).toBe(200);
  });

  it("lets the platform admin edit plan prices and limits", async () => {
    const plans = await ops.send("get", "/platform/plans");
    const starter = plans.body.find((p: { code: string }) => p.code === "starter");
    const updated = await ops.send("put", "/platform/plans/starter", { ...starter, priceMonthly: 3500 });
    expect(updated.body.priceMonthly).toBe(3500);
    await ops.send("put", "/platform/plans/starter", starter);
    expect((await tenant.send("put", "/platform/plans/starter", starter)).status).toBe(403);
  });
});
