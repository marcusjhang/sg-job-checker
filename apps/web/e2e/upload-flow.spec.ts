import path from "node:path";
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("upload a clean PDF, scan it, extract literal fields, and review", async ({ page }) => {
  const email = `e2e-upload-${Date.now()}@example.com`;
  await page.goto("/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/new/);

  await page.getByLabel("Date of birth", { exact: true }).fill("1992-05-15");
  await page.getByLabel("Monthly basic salary (S$)", { exact: true }).fill("6000");
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

  await expect(page.getByRole("textbox", { name: /^Basic monthly salary/ })).toHaveValue("6000.00");
  await expect(page.getByRole("textbox", { name: /^Employer legal name/ })).toHaveValue(
    "Acme Pte Ltd"
  );
  await expect(page.getByRole("textbox", { name: /^Job title/ })).toHaveValue("Software Developer");
  await expect(page.getByRole("textbox", { name: /^Start date/ })).toHaveValue("2026-12-01");
  await expect(page.getByText(/Extracted p\.1/).first()).toBeVisible();
});
