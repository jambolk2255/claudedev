import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SCREENSHOT_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

async function setupCompany(page: Page) {
  const stamp = Date.now();
  await page.goto("/register");
  await page.getByLabel("Company name").fill("Lanka Pharmacy");
  await page.getByLabel("Your full name").fill("Dilani Fernando");
  await page.getByLabel("Work email").fill(`inv+${stamp}@lankapharmacy.lk`);
  await page.getByLabel("Password", { exact: true }).fill("Str0ng-Passw0rd!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Tell us about your company" })).toBeVisible();

  const csrf = (await page.context().cookies()).find((c) => c.name === "sf_csrf")!.value;
  const steps: Record<string, unknown> = {
    company: { name: "Lanka Pharmacy (Pvt) Ltd", city: "Colombo" },
    industry: { industry: "pharmacy" },
    modules: { mode: "advanced", modules: ["inventory", "purchasing", "sales", "multiWarehouse", "batches"] },
    finance: {
      currency: "LKR",
      fiscalYearStartMonth: 4,
      vatRegistered: true,
      vatRate: 18,
      ssclEnabled: true,
      ssclRate: 2.5,
      valuationMethod: "fifo",
      allowNegativeStock: false,
    },
    warehouses: {
      warehouses: [
        { name: "Colombo Store", code: "CMB", isDefault: true, latitude: 6.9271, longitude: 79.8612 },
        { name: "Kandy Branch", code: "KDY" },
      ],
    },
    data: { start: "demo" },
  };
  for (const [k, v] of Object.entries(steps))
    expect((await page.request.put(`/api/v1/onboarding/${k}`, { data: v, headers: { "x-csrf-token": csrf } })).ok()).toBe(true);
  expect((await page.request.post("/api/v1/onboarding/complete", { data: {}, headers: { "x-csrf-token": csrf } })).ok()).toBe(true);
}

test("inventory: products, stock in/out, transfer, count, ledger and contacts", async ({ page }) => {
  const missing: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /MISSING_MESSAGE|IntlError/.test(msg.text())) missing.push(msg.text());
  });

  await setupCompany(page);

  // Overview with sample data
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await expect(page.getByText("Value by warehouse")).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, "inv-01-overview");

  // Products list → create a product in the side sheet
  await page.getByRole("link", { name: "Products" }).click();
  await expect(page.getByText("DEMO-001")).toBeVisible();
  await shot(page, "inv-02-products");
  await page.getByRole("button", { name: "New product" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Cetirizine 10mg (strip)");
  await page.getByLabel("SKU", { exact: true }).fill("CET-10");
  await page.getByLabel("Cost price").fill("35");
  await page.getByLabel("Selling price").fill("55");
  await page.getByLabel("Reorder level").fill("40");
  await shot(page, "inv-03-product-form");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("heading", { name: /Cetirizine 10mg/ })).toBeVisible();
  await expect(page.getByText("Out of stock").first()).toBeVisible();

  // Stock in from the product page (product preselected)
  await page.locator('a[href*="product="]', { hasText: "Stock in" }).click();
  await expect(page.getByRole("tab", { name: "Stock in", selected: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /CET-10/ })).toBeVisible();
  await page.getByLabel("Quantity", { exact: true }).fill("100");
  await page.getByLabel("Unit cost").fill("32.5");
  await page.getByLabel("Reference").fill("INV-7781");
  await shot(page, "inv-04-stock-in-form");
  await page.getByRole("button", { name: "Post Stock in" }).click();
  await expect(page.getByRole("heading", { name: /Stock in SIN-\d{4}-\d+/ })).toBeVisible();
  await expect(page.getByText("INV-7781")).toBeVisible();
  await shot(page, "inv-05-stock-in-doc");

  // Stock out via scanner field
  await page.goto("/inventory/documents/new?type=stock_out");
  await page.getByLabel("Scan barcode or type SKU + Enter").fill("CET-10");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /CET-10/ })).toBeVisible();
  await page.getByLabel("Quantity", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Post Stock out" }).click();
  await expect(page.getByRole("heading", { name: /Stock out SOUT-/ })).toBeVisible();

  // Over-issue is refused with a clear message
  await page.goto("/inventory/documents/new?type=stock_out");
  await page.getByLabel("Scan barcode or type SKU + Enter").fill("CET-10");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /CET-10/ })).toBeVisible();
  await page.getByLabel("Quantity", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Post Stock out" }).click();
  await expect(page.getByText(/Not enough stock for CET-10: 70 available/)).toBeVisible();

  // Transfer to Kandy, then receive
  await page.goto("/inventory/documents/new?type=transfer");
  await page.getByLabel("Scan barcode or type SKU + Enter").fill("CET-10");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /CET-10/ })).toBeVisible();
  await page.getByLabel("Quantity", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Post Transfer" }).click();
  await expect(page.getByText("In transit").first()).toBeVisible();
  await page.getByRole("button", { name: "Receive transfer" }).click();
  await expect(page.getByText("Received").first()).toBeVisible();
  await shot(page, "inv-06-transfer");

  // Stock count shows the variance
  await page.goto("/inventory/documents/new?type=count");
  await page.getByLabel("Scan barcode or type SKU + Enter").fill("CET-10");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /CET-10/ })).toBeVisible();
  await page.getByLabel("Quantity", { exact: true }).fill("48");
  await expect(page.getByText("-2")).toBeVisible();
  await page.getByRole("button", { name: "Post Stock count" }).click();
  await expect(page.getByRole("heading", { name: /Stock count CNT-/ })).toBeVisible();

  // Product detail reflects everything
  await page.goto("/inventory/products?stock=all");
  await page.getByText("Cetirizine 10mg (strip)").click();
  await expect(page.getByText("Stock by warehouse")).toBeVisible();
  await expect(page.getByText("Kandy Branch")).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, "inv-07-product-detail");

  // Ledger
  await page.getByRole("link", { name: "Stock ledger" }).click();
  await expect(page.getByText("Ledger entries can't be edited or deleted")).toBeVisible();
  await shot(page, "inv-08-ledger");

  // Alerts in the bell
  await page.getByRole("button", { name: /alerts/ }).click();
  await expect(page.getByRole("link", { name: "View all alerts" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Contacts
  await page.goto("/contacts/suppliers");
  await page.getByRole("button", { name: "New supplier" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Hemas Pharmaceuticals");
  await page.getByLabel("Phone", { exact: true }).fill("+94 11 247 3000");
  await page.getByLabel("Payment terms (days)").fill("30");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Hemas Pharmaceuticals")).toBeVisible();
  await expect(page.getByText("SUP-0001")).toBeVisible();
  await shot(page, "inv-09-suppliers");

  // Dashboard now shows stock value
  await page.goto("/dashboard");
  await expect(page.getByText("Stock value")).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, "inv-10-dashboard");

  expect(missing).toEqual([]);
});
