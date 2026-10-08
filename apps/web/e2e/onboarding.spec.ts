import { expect, test } from "@playwright/test";

const SHOTS = process.env.SCREENSHOT_DIR;
const shot = (name: string) => (SHOTS ? { path: `${SHOTS}/${name}.png`, fullPage: true } : undefined);

test("owner registers, completes the onboarding wizard and reaches the dashboard", async ({ page }) => {
  const stamp = Date.now();
  const email = `owner+${stamp}@lanka-traders.lk`;
  const password = "Str0ng-Passw0rd!";

  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Set up your company" })).toBeVisible();
  await page.getByLabel("Company name").fill("Lanka Traders");
  await page.getByLabel("Your full name").fill("Nimal Perera");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  if (SHOTS) await page.screenshot(shot("01-register"));
  await page.getByRole("button", { name: "Create account" }).click();

  // Step 1 — company
  await expect(page.getByRole("heading", { name: "Tell us about your company" })).toBeVisible();
  await page.getByLabel("Trading name").fill("Lanka Traders (Pvt) Ltd");
  await page.getByLabel("VAT number").fill("123456789-7000");
  await page.getByLabel("City").fill("Colombo");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — industry
  await expect(page.getByRole("heading", { name: "What kind of business is it?" })).toBeVisible();
  await page.getByRole("radio", { name: "Pharmacy" }).click();
  await expect(page.getByText("We'll set up for you")).toBeVisible();
  if (SHOTS) await page.screenshot(shot("02-industry"));
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 — modules
  await expect(page.getByRole("heading", { name: "Choose your experience" })).toBeVisible();
  await page.getByRole("radio", { name: /Advanced/ }).click();
  if (SHOTS) await page.screenshot(shot("03-modules"));
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4 — finance (Sri Lanka defaults)
  await expect(page.getByRole("heading", { name: "Currency, tax and stock valuation" })).toBeVisible();
  await expect(page.getByLabel("VAT rate")).toHaveValue("18");
  await page.getByRole("radio", { name: /FIFO/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 5 — warehouses
  await expect(page.getByRole("heading", { name: "Where do you keep stock?" })).toBeVisible();
  await page.getByLabel("Latitude").fill("6.9271");
  await page.getByLabel("Longitude").fill("79.8612");
  await page.getByRole("button", { name: "Add another warehouse" }).click();
  await page.locator("#w-1-name").fill("Kandy Branch");
  await page.locator("#w-1-code").fill("KDY");
  if (SHOTS) await page.screenshot(shot("04-warehouses"));
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 6 — numbering
  await expect(page.getByRole("heading", { name: "Document numbering" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 7 — team
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByPlaceholder("name@company.lk").fill(`store+${stamp}@lanka-traders.lk`);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 8 — data
  await expect(page.getByRole("heading", { name: "How would you like to start?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Review & finish
  await expect(page.getByRole("heading", { name: "Review and finish" })).toBeVisible();
  await expect(page.getByText("KDY")).toBeVisible();
  if (SHOTS) await page.screenshot(shot("05-review"));
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "You're all set!" })).toBeVisible();
  await expect(page.getByText(`store+${stamp}@lanka-traders.lk`)).toBeVisible();
  await page.waitForTimeout(1200);
  if (SHOTS) await page.screenshot(shot("06-success"));
  await page.getByRole("button", { name: "Go to dashboard" }).click();

  // Dashboard
  await expect(page.getByRole("heading", { name: /Nimal/ })).toBeVisible();
  await expect(page.getByText("Main Store").first()).toBeVisible();
  await expect(page.getByText("Kandy Branch")).toBeVisible();
  await page.waitForTimeout(1500);
  if (SHOTS) await page.screenshot(shot("07-dashboard"));

  // Command palette → users
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search pages and actions…").fill("users");
  if (SHOTS) await page.screenshot(shot("08-command-palette"));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("Pending invitations")).toBeVisible();

  // Roles & permissions matrix
  await page.goto("/settings/roles");
  await expect(page.getByRole("heading", { name: "Roles & permissions" })).toBeVisible();
  await page.getByRole("tab", { name: /Storekeeper/ }).click();
  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot(shot("09-roles"));

  // Sinhala UI
  await page.goto("/si/dashboard");
  await expect(page.getByRole("heading", { name: /Nimal/ })).toBeVisible();
  await expect(page.getByText("ගබඩා").first()).toBeVisible();
  await page.waitForTimeout(1500);
  if (SHOTS) await page.screenshot(shot("10-dashboard-sinhala"));

  // The chosen language is remembered; switch back to English explicitly.
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);

  // Sign out → protected pages redirect to login
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test("wrong password shows an error and dark mode login renders", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Wrong-Passw0rd");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot(shot("00-login-dark"));
});
