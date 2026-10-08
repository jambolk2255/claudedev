import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SCREENSHOT_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

async function csrf(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === "sf_csrf")!.value;
}

async function post<T>(page: Page, path: string, data: unknown): Promise<T> {
  const res = await page.request.post(`/api/v1${path}`, { data, headers: { "x-csrf-token": await csrf(page) } });
  expect(res.ok(), `${path}: ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

async function setupCompany(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Company name").fill("Ceylon Traders");
  await page.getByLabel("Your full name").fill("Nimal Perera");
  await page.getByLabel("Work email").fill(`trade+${Date.now()}@ceylontraders.lk`);
  await page.getByLabel("Password", { exact: true }).fill("Str0ng-Passw0rd!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Tell us about your company" })).toBeVisible();
  const headers = { "x-csrf-token": await csrf(page) };
  const steps: Record<string, unknown> = {
    company: { name: "Ceylon Traders (Pvt) Ltd", city: "Colombo", phone: "0112345678" },
    industry: { industry: "wholesale" },
    modules: { mode: "advanced", modules: ["inventory", "purchasing", "sales", "orders", "finance", "reports", "maps"] },
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
    warehouses: { warehouses: [{ name: "Colombo Store", code: "CMB", isDefault: true, latitude: 6.9271, longitude: 79.8612 }] },
    data: { start: "empty" },
  };
  for (const [k, v] of Object.entries(steps)) {
    const res = await page.request.put(`/api/v1/onboarding/${k}`, { data: v, headers });
    expect(res.ok(), `${k}: ${await res.text()}`).toBe(true);
  }
  expect((await page.request.post("/api/v1/onboarding/complete", { data: {}, headers })).ok()).toBe(true);

  const taxes = (await (await page.request.get("/api/v1/tax-rates")).json()) as { id: string; code: string }[];
  const vat = taxes.find((t) => t.code === "VAT")!.id;
  await post(page, "/products", { sku: "RICE-5", name: "Samba Rice 5kg", costPrice: 1200, sellPrice: 1500, taxRateId: vat });
  await post(page, "/products", { sku: "OIL-1", name: "Coconut Oil 1L", costPrice: 650, sellPrice: 850, taxRateId: vat });
  await post(page, "/partners", { type: "supplier", name: "Lanka Mills", city: "Kandy", paymentTermsDays: 30 });
  await post(page, "/partners", { type: "customer", name: "Galle Super", city: "Galle", paymentTermsDays: 14, latitude: 6.0535, longitude: 80.221 });
}

async function pickPartner(page: Page, label: string, name: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

async function addProduct(page: Page, sku: string, qty: string) {
  await page.getByRole("button", { name: "Select a product…" }).last().click();
  await page.getByRole("option", { name: new RegExp(sku) }).click();
  const row = page.locator("tr", { hasText: sku });
  await row.getByLabel("Qty").fill(qty);
}

test("purchasing, sales, POS, returns, finance and reports", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const missing: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /MISSING_MESSAGE|IntlError/.test(msg.text())) missing.push(msg.text());
  });
  await setupCompany(page);

  // ── Purchasing: PO → GRN → bill → payment ───────────────────────────────
  await page.goto("/purchasing");
  await expect(page.getByRole("heading", { name: "Purchasing" })).toBeVisible();
  await expect(page.getByText("No purchase orders yet")).toBeVisible();
  await page.getByRole("link", { name: "New purchase order" }).first().click();
  await pickPartner(page, "Supplier", "Lanka Mills");
  await addProduct(page, "RICE-5", "20");
  await shot(page, "com-01-po-form");
  await page.getByRole("button", { name: "Save & confirm" }).click();
  await expect(page.getByRole("heading", { name: /Purchase order PO-/ })).toBeVisible();
  await expect(page.locator("h2").getByText("Confirmed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Receive goods" }).click();
  await expect(page.getByText(/20 .* outstanding/)).toBeVisible();
  await page.getByLabel("Quantity").fill("15");
  await page.getByRole("button", { name: "Post GRN" }).click();
  await expect(page.locator("h2").getByText("Partly done")).toBeVisible();
  await shot(page, "com-02-po-partial");

  await page.getByRole("link", { name: "Enter bill" }).click();
  await expect(page.getByRole("heading", { name: "Record supplier bill" })).toBeVisible();
  await page.getByLabel("Supplier invoice no.").fill("LM-7781");
  await page.getByRole("button", { name: "Record bill" }).click();
  await expect(page.getByRole("heading", { name: /Bill BILL-/ })).toBeVisible();
  // 15 × 1,200 = 18,000 + 18% VAT
  await expect(page.getByText("21,240.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Pay bill" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("21240");
  await page.getByRole("radio", { name: "Bank transfer" }).click();
  await shot(page, "com-03-pay-bill");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.locator("h2").getByText("Paid", { exact: true })).toBeVisible();

  // ── Sales: SO → delivery → invoice → receipt → return ───────────────────
  await page.goto("/sales/orders/new");
  await pickPartner(page, "Customer", "Galle Super");
  await addProduct(page, "RICE-5", "4");
  await page.getByRole("button", { name: "Save & confirm" }).click();
  await expect(page.getByRole("heading", { name: /Sales order SO-/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy tracking link" })).toBeVisible();
  const orderId = page.url().split("/").pop()!;

  await page.getByRole("button", { name: "Deliver" }).click();
  await page.getByRole("button", { name: "Post delivery" }).click();
  await expect(page.locator("h2").getByText("Fulfilled")).toBeVisible();
  await page.getByRole("link", { name: "Create invoice" }).click();
  await page.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByRole("heading", { name: /Invoice INV-/ })).toBeVisible();
  // 4 × 1,500 = 6,000 + SSCL 150 + VAT 18% on 6,150 = 1,107 → 7,257
  await expect(page.getByText("7,257.00").first()).toBeVisible();
  await shot(page, "com-04-invoice");
  await page.getByRole("button", { name: "Receive payment" }).click();
  await page.getByRole("button", { name: "Record receipt" }).click();
  await expect(page.locator("h2").getByText("Paid", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Customer return" }).click();
  await page
    .getByRole("row", { name: /RICE-5/ })
    .getByLabel("Return qty")
    .fill("1");
  await page.getByRole("button", { name: "Record return & credit note" }).click();
  await expect(page.getByRole("heading", { name: /Credit note CN-/ })).toBeVisible();
  await shot(page, "com-05-credit-note");

  // Public tracking page (no login)
  const order = (await (await page.request.get(`/api/v1/orders/${orderId}`)).json()) as { trackingToken: string };
  const guest = await browser.newPage();
  await guest.goto(`/track/${order.trackingToken}`);
  await expect(guest.getByText("Order from Ceylon Traders (Pvt) Ltd")).toBeVisible();
  await expect(guest.getByText("4 of 4 delivered")).toBeVisible();
  await shot(guest, "com-06-tracking");
  await guest.close();

  // ── Quick sale (POS) ─────────────────────────────────────────────────────
  await page.goto("/sales/pos");
  // 2 × 1,500 = 3,000 + SSCL 75 + VAT 553.50
  await page.getByRole("button", { name: /Samba Rice 5kg/ }).click();
  await page.getByRole("button", { name: /Samba Rice 5kg/ }).click();
  await expect(page.getByTestId("pos-total")).toContainText("3,628.50");
  await page.getByLabel("Cash received").fill("4000");
  await shot(page, "com-07-pos");
  await page.getByRole("button", { name: /Charge/ }).click();
  await expect(page.getByText("Sale complete")).toBeVisible();
  await expect(page.getByText(/Give change: .*371\.50/)).toBeVisible();
  await page.getByRole("button", { name: "New sale" }).click();

  // ── Order board, finance and reports ────────────────────────────────────
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Order tracking" })).toBeVisible();
  await page.getByRole("tab", { name: "Supplier orders" }).click();
  await expect(page.getByText("Lanka Mills")).toBeVisible();

  await page.goto("/finance");
  await expect(page.getByText("Cash & bank accounts")).toBeVisible();
  await shot(page, "com-08-finance");
  await page.getByRole("link", { name: "Statements" }).click();
  await page.getByRole("tab", { name: "Trial balance" }).click();
  await expect(page.getByText("Books are balanced")).toBeVisible();
  await page.getByRole("tab", { name: "Balance sheet" }).click();
  await expect(page.getByText("Books are balanced")).toBeVisible();
  await page.getByRole("tab", { name: "Profit & loss" }).click();
  await expect(page.getByText("Net profit").first()).toBeVisible();
  await page.getByRole("link", { name: "Receivables" }).click();
  await expect(page.getByText("No customer owes you anything")).toBeVisible();
  await page.getByRole("link", { name: "Journal" }).click();
  await expect(page.getByText("Sales invoice").first()).toBeVisible();

  await page.goto("/reports");
  await expect(page.getByText("Net sales")).toBeVisible();
  await page.getByRole("link", { name: "Margins" }).click();
  await expect(page.getByText("Samba Rice 5kg")).toBeVisible();
  await page.getByRole("link", { name: "Stock value" }).click();
  // 15 received − 4 delivered + 1 returned − 2 sold at the counter
  await expect(page.getByRole("row", { name: /Samba Rice 5kg.*10/ })).toBeVisible();
  await shot(page, "com-09-reports");

  await page.goto("/dashboard");
  await expect(page.getByText("Sales · last 30 days")).toBeVisible();
  await shot(page, "com-10-dashboard");

  // Sinhala UI renders the new modules without missing strings
  for (const path of [
    "/si/purchasing",
    "/si/sales",
    "/si/finance",
    "/si/finance/statements",
    "/si/reports",
    "/si/orders",
    "/si/maps",
    "/si/sales/pos",
    "/si/reports/import",
    "/si/inventory/labels",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  await expect(page.getByText("ලේබල්").first()).toBeVisible();
  expect(missing).toEqual([]);
});
