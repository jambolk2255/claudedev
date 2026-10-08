import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { PASSWORD, bootTestApp, mobile } from "./helpers";

type Method = "get" | "post" | "put" | "patch" | "delete";

describe("Purchasing, sales, finance and reports (e2e)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let call: (method: Method, url: string, body?: object) => request.Test;
  let main: string;
  let vat: string;
  let cash: string;
  let bank: string;
  let supplier: string;
  let customer: string;
  let product: string;
  let po: { id: string; lines: { id: string }[] };
  let bill: { id: string; total: string };
  let invoice: { id: string; total: string };

  const as = (token: string) => (method: Method, url: string, body?: object) => {
    const req = mobile(app, method, url, token);
    return body ? req.send(body) : req;
  };
  const level = async (productId: string) => Number((await prisma.stockLevel.findFirst({ where: { productId, warehouseId: main } }))?.quantity ?? 0);

  beforeAll(async () => {
    ({ app, prisma } = await bootTestApp());
    const reg = await mobile(app, "post", "/auth/register").send({ companyName: "Trade Co", name: "Trade Owner", email: "owner@trade.lk", password: PASSWORD });
    call = as(reg.body.tokens.accessToken);
    const steps: Record<string, object> = {
      company: { name: "Trade Co" },
      industry: { industry: "wholesale" },
      modules: { mode: "advanced", modules: ["inventory", "purchasing", "sales", "finance", "reports", "approvals", "multiWarehouse"] },
      finance: {
        currency: "LKR",
        fiscalYearStartMonth: 4,
        vatRegistered: true,
        vatRate: 18,
        ssclEnabled: true,
        ssclRate: 2.5,
        valuationMethod: "weighted_average",
        allowNegativeStock: false,
      },
      warehouses: { warehouses: [{ name: "Main", code: "MAIN", isDefault: true }] },
    };
    for (const [k, v] of Object.entries(steps)) await call("put", `/onboarding/${k}`, v);
    await call("post", "/onboarding/complete", {});
    main = (await call("get", "/warehouses")).body[0].id;
    vat = ((await call("get", "/tax-rates")).body as { id: string; code: string }[]).find((t) => t.code === "VAT")!.id;
    const accounts = (await call("get", "/finance/accounts")).body as { id: string; systemKey: string }[];
    cash = accounts.find((a) => a.systemKey === "cash")!.id;
    bank = accounts.find((a) => a.systemKey === "bank")!.id;
    supplier = (await call("post", "/partners", { type: "supplier", name: "Ceylon Supplies", paymentTermsDays: 30 })).body.id;
    customer = (await call("post", "/partners", { type: "customer", name: "Kandy Retail", creditLimit: 2000, paymentTermsDays: 30 })).body.id;
    product = (await call("post", "/products", { name: "Widget", sku: "WID", sellPrice: 200, taxRateId: vat })).body.id;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function expectBalancedBooks() {
    const tb = (await call("get", "/finance/trial-balance")).body;
    expect(tb.balanced).toBe(true);
    const bs = (await call("get", "/finance/balance-sheet")).body;
    expect(bs.balanced).toBe(true);
  }

  // ─── Phase 2: purchasing ───────────────────────────────────────────────────

  it("creates and confirms a purchase order", async () => {
    const res = await call("post", "/orders", {
      kind: "purchase",
      partnerId: supplier,
      warehouseId: main,
      expectedDate: "2026-01-01",
      lines: [{ productId: product, quantity: 10, unitPrice: 100, taxRateId: vat }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "draft", number: expect.stringMatching(/^PO-/) });
    expect(Number(res.body.total)).toBe(1180);
    po = (await call("get", `/orders/${res.body.id}`)).body;
    // Can't receive before confirmation.
    expect((await call("post", `/orders/${po.id}/fulfil`, { lines: [{ orderLineId: po.lines[0]!.id, quantity: 1 }] })).body.code).toBe("ORDER_NOT_OPEN");
    expect((await call("post", `/orders/${po.id}/confirm`, {})).body.status).toBe("confirmed");
    // Overdue list includes it (expected date in the past).
    expect((await call("get", "/orders?kind=purchase&overdue=true")).body.total).toBe(1);
  });

  it("receives goods with a GRN at the order price", async () => {
    const grn = await call("post", `/orders/${po.id}/fulfil`, { reference: "DN-55", lines: [{ orderLineId: po.lines[0]!.id, quantity: 6 }] });
    expect(grn.status).toBe(201);
    expect(grn.body.number).toMatch(/^GRN-/);
    expect(grn.body.movements[0]).toMatchObject({ type: "purchase_in" });
    expect(Number(grn.body.movements[0].unitCost)).toBe(100);
    expect(await level(product)).toBe(6);
    expect((await call("get", `/orders/${po.id}`)).body.status).toBe("partial");
    expect((await call("post", `/orders/${po.id}/fulfil`, { lines: [{ orderLineId: po.lines[0]!.id, quantity: 5 }] })).body).toMatchObject({
      code: "OVER_FULFIL",
      outstanding: 4,
    });
  });

  it("bills only received goods and books the price variance", async () => {
    const tooMuch = await call("post", "/invoices", {
      kind: "purchase",
      partnerId: supplier,
      orderId: po.id,
      supplierRef: "SUP-INV-1",
      lines: [{ orderLineId: po.lines[0]!.id, quantity: 8, unitPrice: 105, taxRateId: vat }],
    });
    expect(tooMuch.body.code).toBe("OVER_INVOICE");
    const res = await call("post", "/invoices", {
      kind: "purchase",
      partnerId: supplier,
      orderId: po.id,
      supplierRef: "SUP-INV-1",
      lines: [{ orderLineId: po.lines[0]!.id, quantity: 6, unitPrice: 105, taxRateId: vat }],
    });
    expect(res.status).toBe(201);
    bill = res.body;
    expect(Number(bill.total)).toBe(743.4);
    const journal = await prisma.journalEntry.findFirstOrThrow({ where: { sourceId: bill.id }, include: { lines: { include: { account: true } } } });
    const byKey = Object.fromEntries(journal.lines.map((l) => [l.account.systemKey, Number(l.debit) - Number(l.credit)]));
    expect(byKey).toEqual({ grni: 600, ppv: 30, vat_input: 113.4, ap: -743.4 });
    // Direct bills for stock items are refused (receive first).
    expect(
      (await call("post", "/invoices", { kind: "purchase", partnerId: supplier, lines: [{ productId: product, quantity: 1, unitPrice: 1 }] })).body.code,
    ).toBe("RECEIVE_FIRST");
  });

  it("re-opens a bill when a cheque bounces, then settles it", async () => {
    const cheque = await call("post", "/payments", {
      kind: "payment",
      partnerId: supplier,
      method: "cheque",
      chequeNo: "000123",
      chequeDate: "2026-12-01",
      accountId: bank,
      amount: 500,
      allocations: [{ invoiceId: bill.id, amount: 500 }],
    });
    expect(cheque.status).toBe(201);
    expect((await call("get", `/invoices/${bill.id}`)).body.status).toBe("partially_paid");
    const bounced = await call("post", `/payments/${cheque.body.id}/bounce`, {});
    expect(bounced.body).toMatchObject({ status: "bounced", chequeStatus: "bounced" });
    expect((await call("get", `/invoices/${bill.id}`)).body).toMatchObject({ status: "open", amountPaid: "0" });

    expect(
      (
        await call("post", "/payments", {
          kind: "payment",
          partnerId: supplier,
          method: "bank_transfer",
          accountId: bank,
          amount: 743.4,
          allocations: [{ invoiceId: bill.id, amount: 800 }],
        })
      ).status,
    ).toBe(400);
    const paid = await call("post", "/payments", {
      kind: "payment",
      partnerId: supplier,
      method: "bank_transfer",
      accountId: bank,
      amount: 743.4,
      allocations: [{ invoiceId: bill.id, amount: 743.4 }],
    });
    expect(paid.status).toBe(201);
    expect((await call("get", `/invoices/${bill.id}`)).body.status).toBe("paid");
    await expectBalancedBooks();
  });

  it("returns goods to the supplier with an automatic debit note", async () => {
    const ret = await call("post", "/returns", {
      kind: "outward",
      partnerId: supplier,
      warehouseId: main,
      invoiceId: bill.id,
      reason: "Damaged in transit",
      lines: [{ productId: product, quantity: 2 }],
    });
    expect(ret.status).toBe(201);
    expect(ret.body).toMatchObject({ kind: "debit", number: expect.stringMatching(/^DN-/) });
    expect(Number(ret.body.total)).toBe(247.8);
    expect(await level(product)).toBe(4);
    // Can't return more than billed.
    expect(
      (
        await call("post", "/returns", {
          kind: "outward",
          partnerId: supplier,
          warehouseId: main,
          invoiceId: bill.id,
          lines: [{ productId: product, quantity: 5 }],
        })
      ).body.code,
    ).toBe("OVER_RETURN");
    await call("post", `/orders/${po.id}/fulfil`, { lines: [{ orderLineId: po.lines[0]!.id, quantity: 4 }] });
    expect((await call("get", `/orders/${po.id}`)).body.status).toBe("fulfilled");
    await expectBalancedBooks();
  });

  // ─── Phase 3: sales ────────────────────────────────────────────────────────

  it("converts a quotation into a confirmed, trackable sales order", async () => {
    const q = await call("post", "/orders", {
      kind: "quotation",
      partnerId: customer,
      warehouseId: main,
      lines: [{ productId: product, quantity: 3, unitPrice: 200, taxRateId: vat }],
    });
    expect(q.body.number).toMatch(/^QT-/);
    // SSCL 2.5% on 600 = 15, VAT 18% on 615 = 110.70
    expect(Number(q.body.total)).toBe(725.7);
    const so = await call("post", `/orders/${q.body.id}/convert`, {});
    expect(so.body).toMatchObject({ kind: "sales", status: "draft", number: expect.stringMatching(/^SO-/) });
    expect((await call("get", `/orders/${q.body.id}`)).body.status).toBe("closed");
    const confirmed = await call("post", `/orders/${so.body.id}/confirm`, {});
    expect(confirmed.body.trackingToken).toBeTruthy();

    const soDetail = (await call("get", `/orders/${so.body.id}`)).body;
    const del = await call("post", `/orders/${so.body.id}/fulfil`, { lines: [{ orderLineId: soDetail.lines[0].id, quantity: 2 }] });
    expect(del.body.number).toMatch(/^DEL-/);
    expect(Number(del.body.movements[0].quantity)).toBe(-2);

    const tracking = await request(app.getHttpServer()).get(`/api/v1/track/${confirmed.body.trackingToken}`);
    expect(tracking.status).toBe(200);
    expect(tracking.body).toMatchObject({ number: so.body.number, status: "partial", company: "Trade Co" });
    expect(tracking.body.lines[0]).toMatchObject({ quantity: 3, delivered: 2 });
    expect(JSON.stringify(tracking.body)).not.toMatch(/unitPrice|total/);
    expect((await request(app.getHttpServer()).get("/api/v1/track/not-a-real-token")).status).toBe(404);

    const inv = await call("post", "/invoices", {
      kind: "sales",
      partnerId: customer,
      orderId: so.body.id,
      lines: [{ orderLineId: soDetail.lines[0].id, quantity: 3, unitPrice: 200, taxRateId: vat }],
    });
    expect(inv.status).toBe(201);
    invoice = inv.body;
    expect(Number(invoice.total)).toBe(725.7);
    const journal = await prisma.journalEntry.findFirstOrThrow({ where: { sourceId: invoice.id }, include: { lines: { include: { account: true } } } });
    expect(Object.fromEntries(journal.lines.map((l) => [l.account.systemKey, Number(l.debit) - Number(l.credit)]))).toEqual({
      ar: 725.7,
      sales: -600,
      sscl: -15,
      vat_output: -110.7,
    });
  });

  it("enforces customer credit limits", async () => {
    const so = await call("post", "/orders", {
      kind: "sales",
      partnerId: customer,
      warehouseId: main,
      lines: [{ productId: product, quantity: 10, unitPrice: 200 }],
    });
    const res = await call("post", `/orders/${so.body.id}/confirm`, {});
    expect(res.body).toMatchObject({ code: "CREDIT_LIMIT", balance: 725.7, creditLimit: 2000 });
    await call("post", `/orders/${so.body.id}/cancel`, {});
  });

  it("receives payment, takes a return with a credit note and keeps a statement", async () => {
    const rct = await call("post", "/payments", {
      kind: "receipt",
      partnerId: customer,
      method: "cash",
      accountId: cash,
      amount: 725.7,
      allocations: [{ invoiceId: invoice.id, amount: 725.7 }],
    });
    expect(rct.body.number).toMatch(/^RCT-/);
    expect((await call("get", `/invoices/${invoice.id}`)).body.status).toBe("paid");

    const before = await level(product);
    const ret = await call("post", "/returns", {
      kind: "inward",
      partnerId: customer,
      warehouseId: main,
      invoiceId: invoice.id,
      reason: "Wrong colour",
      lines: [{ productId: product, quantity: 1 }],
    });
    expect(ret.body).toMatchObject({ kind: "credit", number: expect.stringMatching(/^CN-/), status: "open" });
    expect(Number(ret.body.total)).toBe(241.9);
    expect(await level(product)).toBe(before + 1);

    const st = (await call("get", `/finance/statements/${customer}`)).body;
    expect(st.lines.map((l: { type: string }) => l.type)).toEqual(["invoice", "payment", "note"]);
    expect(st.closing).toBe(-241.9);
    await expectBalancedBooks();
  });

  it("rings up a counter sale with stock, invoice and receipt at once", async () => {
    const before = await level(product);
    const res = await call("post", "/quick-sale", {
      warehouseId: main,
      lines: [{ productId: product, quantity: 2 }],
      payment: { method: "cash", accountId: cash, tendered: 1000 },
    });
    expect(res.status).toBe(201);
    // 400 + SSCL 10 + VAT 18% of 410 (73.80) = 483.80
    expect(res.body).toMatchObject({ total: 483.8, change: 516.2 });
    expect(await level(product)).toBe(before - 2);
    expect((await call("get", `/invoices/${res.body.invoiceId}`)).body.status).toBe("paid");
    expect(
      (
        await call("post", "/quick-sale", {
          warehouseId: main,
          lines: [{ productId: product, quantity: 1 }],
          payment: { method: "cash", accountId: cash, tendered: 10 },
        })
      ).body.code,
    ).toBe("UNDERPAID");
    expect(
      (await call("post", "/quick-sale", { warehouseId: main, lines: [{ productId: product, quantity: 999 }], payment: { method: "cash", accountId: cash } }))
        .body.code,
    ).toBe("INSUFFICIENT_STOCK");
  });

  // ─── Phase 4: finance ──────────────────────────────────────────────────────

  it("reports profit, VAT and aging from the ledger", async () => {
    const pnl = (await call("get", "/finance/profit-and-loss")).body;
    // Sales 600 + 400, returns -200 → 800 income.
    expect(pnl.totalIncome).toBe(800);
    expect(pnl.cogs).toBeGreaterThan(0);
    const vatReport = (await call("get", "/finance/vat")).body;
    expect(vatReport.vatOutput).toBe(147.6); // 110.70 + 73.80 - 36.90
    expect(vatReport.vatInput).toBe(75.6); // 113.40 - 37.80
    expect(vatReport.vatPayable).toBe(72);
    const aging = (await call("get", "/finance/aging?kind=receivable")).body;
    expect(aging.totals.total).toBe(0);
    const summary = (await call("get", "/finance/summary")).body;
    expect(summary.cashAccounts.find((a: { id: string }) => a.id === cash).balance).toBe(1209.5); // 725.70 + 483.80
  });

  it("posts balanced manual journals and refuses to edit history", async () => {
    const bad = await call("post", "/finance/journals", {
      memo: "Owner capital",
      lines: [
        { accountId: bank, debit: 1000 },
        { accountId: cash, credit: 999 },
      ],
    });
    expect(bad.status).toBe(400);
    const accounts = (await call("get", "/finance/accounts")).body as { id: string; systemKey: string }[];
    const equity = accounts.find((a) => a.systemKey === "equity")!.id;
    const ok = await call("post", "/finance/journals", {
      memo: "Owner capital",
      lines: [
        { accountId: bank, debit: 100000 },
        { accountId: equity, credit: 100000 },
      ],
    });
    expect(ok.status).toBe(201);
    await expect(prisma.journalLine.updateMany({ where: { entryId: ok.body.id }, data: { debit: 1 } })).rejects.toThrow(/immutable/);
    // The database itself refuses unbalanced entries at commit.
    await expect(
      prisma.$transaction(async (tx) => {
        const e = await tx.journalEntry.create({
          data: { organizationId: ok.body.organizationId, number: "JE-TEST", entryDate: new Date(), sourceType: "test" },
        });
        await tx.journalLine.create({ data: { organizationId: ok.body.organizationId, entryId: e.id, accountId: bank, debit: 5 } });
      }),
    ).rejects.toThrow(/not balanced/);
    await expectBalancedBooks();
  });

  // ─── Phase 5: reports & import ─────────────────────────────────────────────

  it("produces sales, margin and valuation reports", async () => {
    const from = "2020-01-01";
    const to = new Date().toISOString().slice(0, 10);
    const sales = (await call("get", `/reports/sales?from=${from}&to=${to}&groupBy=product`)).body;
    expect(sales.rows[0]).toMatchObject({ key: "WID · Widget", quantity: 5, net: 1000 });
    expect(sales.totals).toMatchObject({ net: 1000, returns: 200, netAfterReturns: 800 });
    const margins = (await call("get", `/reports/margins?from=${from}&to=${to}`)).body;
    expect(margins.rows[0]).toMatchObject({ sku: "WID", revenue: 1000 });
    expect(margins.rows[0].margin).toBeLessThan(1000);
    const valuation = (await call("get", "/reports/stock-valuation")).body;
    expect(valuation.rows[0]).toMatchObject({ sku: "WID" });
    const trend = (await call("get", "/reports/trend?days=7")).body;
    expect(trend.series).toHaveLength(7);
    expect(trend.topProducts[0].name).toBe("Widget");
  });

  it("imports products, contacts and opening stock from spreadsheet rows", async () => {
    const rows = [
      { sku: "IMP-1", name: "Imported one", category: "Imported", unit: "box", cost: "50", price: "80", tax: "VAT", reorder: "5" },
      { sku: "IMP-2", name: "X", cost: "abc" },
    ];
    const dry = (await call("post", "/import/products", { rows, dryRun: true })).body;
    expect(dry.imported).toBe(false);
    expect(dry.errors.map((e: { row: number }) => e.row)).toEqual(expect.arrayContaining([3]));
    const ok = (await call("post", "/import/products", { rows: [rows[0], { sku: "WID", name: "Widget (renamed)", price: "210" }], dryRun: false })).body;
    expect(ok).toMatchObject({ imported: true, creates: 1, updates: 1 });
    expect((await call("get", `/products/${product}`)).body.name).toBe("Widget (renamed)");

    const partners = (
      await call("post", "/import/partners", { type: "customer", rows: [{ name: "Galle Mart", phone: "0912234567", terms: "14" }], dryRun: false })
    ).body;
    expect(partners.imported).toBe(true);

    const stock = (await call("post", "/import/opening-stock", { warehouseId: main, rows: [{ sku: "IMP-1", quantity: "40", cost: "50" }], dryRun: false }))
      .body;
    expect(stock.imported).toBe(true);
    const imp = (await call("get", "/products?search=IMP-1")).body.items[0];
    expect(imp.onHand).toBe(40);
    await expectBalancedBooks();
  });

  it("isolates commerce data between organizations", async () => {
    const reg = await mobile(app, "post", "/auth/register").send({ companyName: "Other Co", name: "Other Owner", email: "other@trade.lk", password: PASSWORD });
    const other = as(reg.body.tokens.accessToken);
    expect((await other("get", `/invoices/${invoice.id}`)).status).toBe(404);
    expect((await other("get", `/orders/${po.id}`)).status).toBe(404);
    const theirCustomer = (await other("post", "/partners", { type: "customer", name: "Their customer" })).body.id;
    const theirCash = ((await other("get", "/finance/accounts")).body as { id: string; systemKey: string }[]).find((a) => a.systemKey === "cash")!.id;
    const steal = await other("post", "/payments", {
      kind: "receipt",
      partnerId: theirCustomer,
      method: "cash",
      accountId: theirCash,
      amount: 1,
      allocations: [{ invoiceId: invoice.id, amount: 1 }],
    });
    expect(steal.body.code).toBe("INVOICE_INVALID");
    expect((await other("post", "/payments", { kind: "receipt", partnerId: customer, method: "cash", accountId: theirCash, amount: 1 })).body.code).toBe(
      "PARTNER_INVALID",
    );
  });
});
