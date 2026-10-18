import path from "node:path";
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("upload a clean PDF, scan it, extract literal fields, and review", async ({ page }) => {
  const email = `e2e-upload-${Date.now()}@example.com`;
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/new/);

  await page.getByLabel("Date of birth").fill("1992-05-15");
  await page.getByLabel("Monthly basic salary (S$)").fill("6000");
  await page.getByRole("button", { name: "Check fit and continue" }).click();
  await page.getByRole("checkbox", { name: /I have read the current privacy/ }).check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await page.getByRole("radio", { name: /Upload a clean PDF/ }).check();
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("fixtures/documents/golden/offer-simple.pdf"));
  await page.getByRole("button", { name: "Upload and scan" }).click();

  await expect(page).toHaveURL(/\/processing/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/review/, { timeout: 60_000 });

  await expect(page.getByLabel("Basic monthly salary (S$)")).toHaveValue("6000.00");
  await expect(page.getByLabel("Employer legal name")).toHaveValue("Acme Pte Ltd");
  await expect(page.getByLabel("Job title")).toHaveValue("Software Developer");
  await expect(page.getByLabel("Start date")).toHaveValue("2026-12-01");
  await expect(page.getByText(/Extracted p\.1/).first()).toBeVisible();
});
