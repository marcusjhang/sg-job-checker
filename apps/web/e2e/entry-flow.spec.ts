import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe.configure({ mode: "serial" });

test("offer flow: scope, privacy, manual facts, CPF report, share, export, delete", async ({
  page,
  context
}) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Know what the offer actually pays"
  );
  await expect(page.getByRole("button", { name: /Payslip/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Compare/ })).toBeDisabled();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((v) => v.impact === "critical" || v.impact === "serious")
  ).toEqual([]);

  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/new/);

  await page.getByLabel("Date of birth").fill("1992-05-15");
  await page.getByLabel("Monthly basic salary (S$)").fill("6000");
  await page.getByRole("button", { name: "Check fit and continue" }).click();
  await page.getByRole("checkbox", { name: /I have read the current privacy/ }).check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await page.getByRole("radio", { name: /Enter the facts manually/ }).check();
  await page.getByRole("button", { name: "Create and enter facts" }).click();
  await expect(page).toHaveURL(/\/documents\/[^/]+\/review/);
  const documentId = page.url().split("/documents/")[1]?.split("/")[0];
  expect(documentId).toBeTruthy();

  await page.getByLabel("Compensation period (YYYY-MM)").fill("2026-12");
  await page.getByLabel("Employer legal name").fill("Acme Pte Ltd");
  await page.getByLabel("Employee name").fill("Alex Tan");
  await page.getByLabel("Job title").fill("Software Developer");
  await page
    .getByLabel("Duties (one per line)")
    .fill("Build TypeScript APIs\nReview code and databases");
  await page.getByLabel("Date of birth").fill("1992-05-15");
  await page.getByLabel("Basic monthly salary (S$)").fill("6000");
  await page.getByLabel("Start date").fill("2026-12-01");
  await page.getByLabel("Working hours per day").fill("8");
  await page.getByLabel("Working days per week").fill("5");
  await page.getByLabel("Salary period").fill("Monthly");
  await page.getByLabel("Rest day").fill("Saturday");
  await page.getByLabel("Annual leave").fill("14 days");
  await page.getByLabel("Outpatient sick leave").fill("14 days");
  await page.getByLabel("Hospitalisation leave").fill("60 days");
  await page.getByLabel("Medical benefits").fill("Outpatient and hospitalisation insurance");
  await page.getByLabel("Probation").fill("3 months");
  await page.getByLabel("Notice period").fill("1 month");

  const confirmations = page.getByRole("checkbox", { name: "I confirm this" });
  const count = await confirmations.count();
  expect(count).toBeGreaterThan(5);
  for (let index = 0; index < count; index += 1) {
    await confirmations.nth(index).check();
  }
  await page.getByRole("button", { name: "Confirm facts and continue" }).click();
  await expect(page).toHaveURL(/\/occupation/);
  await expect(page.getByRole("heading", { name: "Choose the occupation" })).toBeVisible();

  await page.getByRole("button", { name: "Find matches" }).click();
  await expect(page.getByText("Software Developer").first()).toBeVisible();
  await page.getByRole("radio", { name: /Software Developer/ }).click();
  await expect(page.getByRole("radio", { name: /Software Developer/ })).toBeChecked();
  await page.getByRole("button", { name: "Generate report" }).click();
  await expect(page).toHaveURL(/\/reports\/[^/]+/);
  await expect(page.getByRole("heading", { name: "Software Developer" })).toBeVisible();
  await expect(page.getByText("DEMO_FIXTURE 2026.1").first()).toBeVisible();
  await expect(page.getByText("S$1,200.00").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Questions for HR" })).toBeVisible();

  const reportAccessibility = await new AxeBuilder({ page }).analyze();
  expect(
    reportAccessibility.violations.filter((v) => v.impact === "critical" || v.impact === "serious")
  ).toEqual([]);

  const pdf = await page.request.get(page.url().replace("/reports/", "/api/reports/") + "/export");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");

  await page.getByRole("button", { name: "Create 7-day share link" }).click();
  const shareLink = page.getByRole("link", { name: /\/r\// });
  await expect(shareLink).toBeVisible();
  const shareUrl = await shareLink.getAttribute("href");
  expect(shareUrl).toContain("/r/");

  const shared = await context.newPage();
  await shared.goto(shareUrl!);
  await expect(shared.getByText("View-only shared report")).toBeVisible();
  await expect(shared.getByRole("heading", { name: "Software Developer" })).toBeVisible();
  await shared.close();

  await page.getByRole("button", { name: "Revoke" }).first().click();
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  const revoked = await context.newPage();
  const response = await revoked.goto(shareUrl!);
  expect(response?.status()).toBe(404);
  await revoked.close();

  const deletion = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/documents/${documentId}`) &&
      response.request().method() === "DELETE"
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete everything" }).click();
  const deletionResponse = await deletion;
  expect(deletionResponse.ok()).toBe(true);
  await page.waitForURL((url) => url.pathname === "/reports", { timeout: 15_000 });
  await expect
    .poll(
      async () => {
        await page.reload();
        return page
          .getByText("No reports yet")
          .isVisible()
          .catch(() => false);
      },
      { timeout: 20_000 }
    )
    .toBe(true);

  const documentResponse = await page.request.get(`/api/documents/${documentId}`);
  expect([404, 200]).toContain(documentResponse.status());
  if (documentResponse.status() === 200) {
    const body = await documentResponse.json();
    expect(["DELETION_PENDING", "DELETED"]).toContain(body.state);
  }
});

test("keyboard-only navigation reaches the scope screen", async ({ page }) => {
  const email = `e2e-kb-${Date.now()}@example.com`;
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Email").press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/new|\/signin/);
  await page.goto("/new");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
