import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running API (with ALLOW_MULTI_ORG_SIGNUP=true so every
 * run can register a fresh company) and web app on BASE_URL.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } },
    },
  ],
});
