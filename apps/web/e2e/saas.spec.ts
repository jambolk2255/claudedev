import { expect, test, type Page } from "@playwright/test";

/**
 * Needs the API in SaaS mode:
 *   SAAS_MODE=true PLATFORM_ADMIN_EMAILS=ops-e2e@stockflow.lk PAYHERE_MERCHANT_ID=1211149 PAYHERE_MERCHANT_SECRET=secret
 * and SAAS_E2E=1 for this test run.
 */
test.skip(!process.env.SAAS_E2E, "API is not running in SaaS mode");

const SHOTS = process.env.SCREENSHOT_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const csrf = async (page: Page) => (await page.context().cookies()).find((c) => c.name === "sf_csrf")!.value;
const ADMIN = { email: "ops-e2e@stockflow.lk", password: "Str0ng-Passw0rd!" };

test("self sign-up, trial, bank transfer, PayHere checkout and the platform console", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const missing: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /MISSING_MESSAGE|IntlError/.test(msg.text())) missing.push(msg.text());
  });

  // ── Sign up with a free trial ───────────────────────────────────────────
  await page.goto("/login");
  await page.getByRole("link", { name: /Start your free 14-day trial/ }).click();
  await expect(page.getByText("Free 14-day trial · no card needed")).toBeVisible();
  const company = `Matara Mart ${Date.now()}`;
  await page.getByLabel("Company name").fill(company);
  await page.getByLabel("Your full name").fill("Kasun Jayasuriya");
  await page.getByLabel("Work email").fill(`kasun+${Date.now()}@mataramart.lk`);
  await page.getByLabel("Password", { exact: true }).fill("Str0ng-Passw0rd!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Tell us about your company" })).toBeVisible();
  const headers = { "x-csrf-token": await csrf(page) };
  const steps: Record<string, unknown> = {
    company: { name: company, city: "Matara", phone: "0412222333" },
    industry: { industry: "retail" },
    modules: { mode: "simple", modules: ["inventory", "purchasing", "sales"] },
    finance: {
      currency: "LKR",
      fiscalYearStartMonth: 4,
      vatRegistered: false,
      vatRate: 18,
      ssclEnabled: false,
      ssclRate: 2.5,
      valuationMethod: "weighted_average",
      allowNegativeStock: false,
    },
    warehouses: { warehouses: [{ name: "Main Shop", code: "MAIN", isDefault: true }] },
    data: { start: "empty" },
  };
  for (const [k, v] of Object.entries(steps)) expect((await page.request.put(`/api/v1/onboarding/${k}`, { data: v, headers })).ok()).toBe(true);
  expect((await page.request.post("/api/v1/onboarding/complete", { data: {}, headers })).ok()).toBe(true);

  // ── Billing page: trial on Business, pay Starter by bank transfer ───────
  await page.goto("/settings/billing");
  await expect(page.getByRole("heading", { name: "Plan & billing" })).toBeVisible();
  await expect(page.getByText("Trial", { exact: true })).toBeVisible();
  await expect(page.getByText("14 days left")).toBeVisible();
  await shot(page, "saas-01-billing");
  await page.getByTestId("plan-starter").getByRole("button", { name: "Choose plan" }).click();
  await page.getByRole("radio", { name: /Bank transfer/ }).click();
  await page.getByLabel("Transfer reference").fill("BOC Matara slip 55821");
  await shot(page, "saas-02-pay-dialog");
  await page.getByRole("button", { name: "I've made the transfer" }).click();
  await expect(page.getByText(/We're checking your bank transfer for Starter/)).toBeVisible();

  // ── PayHere: the signed form is posted to the gateway ───────────────────
  let posted = "";
  await page.route("https://sandbox.payhere.lk/**", async (route) => {
    posted = route.request().postData() ?? "";
    await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>PayHere sandbox</h1>" });
  });
  await page.getByRole("tab", { name: /Yearly/ }).click();
  await page.getByTestId("plan-business").getByRole("button", { name: "Choose plan" }).click();
  await page.getByRole("button", { name: /Pay LKR/ }).click();
  await expect(page.getByRole("heading", { name: "PayHere sandbox" })).toBeVisible();
  const form = new URLSearchParams(posted);
  expect(form.get("merchant_id")).toBe("1211149");
  expect(form.get("amount")).toBe("79000.00");
  expect(form.get("hash")).toMatch(/^[A-F0-9]{32}$/);

  // ── Platform admin confirms the bank transfer ──────────────────────────
  const ops = await (await browser.newContext()).newPage();
  const reg = await ops.request.post("/api/v1/auth/register", { data: { companyName: "StockFlow HQ", name: "Ops Admin", ...ADMIN } });
  if (!reg.ok()) expect((await ops.request.post("/api/v1/auth/login", { data: ADMIN })).ok()).toBe(true);
  await ops.goto("/admin");
  await expect(ops.getByRole("heading", { name: "Platform admin" })).toBeVisible();
  await expect(ops.getByText("Monthly recurring revenue")).toBeVisible();
  await shot(ops, "saas-03-admin");
  await ops.getByRole("link", { name: "Review pending payments" }).click();
  const row = ops.getByRole("row", { name: new RegExp(company) }).filter({ hasText: "Bank transfer" });
  await expect(row).toBeVisible();
  ops.once("dialog", (d) => void d.accept());
  await row.getByRole("button", { name: "Confirm payment" }).click();
  await expect(ops.getByText("Payment confirmed and plan activated")).toBeVisible();
  await ops.getByRole("link", { name: "Companies" }).click();
  await ops.getByRole("row", { name: new RegExp(company) }).click();
  await expect(ops.getByRole("button", { name: "Save subscription" })).toBeVisible();
  await shot(ops, "saas-04-tenant");
  const tenantId = (await (await ops.request.get(`/api/v1/platform/tenants?search=${encodeURIComponent(company)}`)).json()).items[0].id as string;

  await page.goto("/settings/billing");
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByText("Paid until", { exact: false })).toBeVisible();

  // ── Expired subscription: banner and read-only ─────────────────────────
  const past = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  const opsCsrf = (await ops.context().cookies()).find((c) => c.name === "sf_csrf")!.value;
  expect(
    (
      await ops.request.put(`/api/v1/platform/tenants/${tenantId}/subscription`, {
        data: { planCode: "starter", status: "active", interval: "month", periodEnd: past },
        headers: { "x-csrf-token": opsCsrf },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/dashboard");
  await expect(page.getByText("Your subscription has ended. Your data is safe but read-only.")).toBeVisible();
  await shot(page, "saas-05-expired");

  await page.goto("/si/settings/billing");
  await expect(page.getByText("සැලසුම සහ බිල්පත්").first()).toBeVisible();
  await ops.goto("/si/admin/plans");
  await expect(ops.getByText("ඇතුළත් modules").first()).toBeVisible();
  expect(missing).toEqual([]);
});
