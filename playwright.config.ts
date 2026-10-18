import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.APP_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } }
  ],
  ...(process.env.PLAYWRIGHT_SKIP_SERVER
    ? {}
    : {
        webServer: {
          command: "node scripts/e2e-server.mjs",
          url: process.env.APP_URL ?? "http://127.0.0.1:3100",
          reuseExistingServer: !process.env.CI,
          timeout: 180_000
        }
      })
});
