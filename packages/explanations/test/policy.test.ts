import { describe, expect, it } from "vitest";
import { draftHrMessage, validateExplanation } from "@job-checker/explanations";
import type { ReportRenderModel } from "@job-checker/contracts";

const model: ReportRenderModel = {
  version: 1,
  reportId: "00000000-0000-4000-8000-000000000050",
  reportVersion: 1,
  generatedAt: "2026-10-18T00:00:00.000Z",
  documentKind: "OFFER",
  partialCoverage: false,
  staleDependencies: [],
  factsSummary: {
    employer: "Acme Pte Ltd",
    employeeName: "Alex Tan",
    jobTitle: "Software Developer",
    startDate: "2026-12-01",
    basicMonthlySalary: { currency: "SGD", cents: 600_000 },
    residency: "CITIZEN",
    compensationPeriod: "2026-11"
  },
  sections: [
    {
      key: "cpf",
      title: "CPF",
      summary: "",
      values: [{ label: "Employee CPF", value: "S$1,200.00", category: "CPF" }],
      warnings: []
    }
  ],
  questions: [{ id: "q1", text: "Is the bonus guaranteed?", reason: "Guarantee not confirmed." }],
  sources: [
    {
      label: "CPF",
      url: "https://www.cpf.gov.sg/employer/employer-obligations/how-much-cpf-contributions-to-pay",
      effectiveDate: "2026-01-01",
      snapshotChecksum: "abc"
    }
  ],
  disclaimers: [],
  confirmedFacts: {} as ReportRenderModel["confirmedFacts"]
};

describe("explanation policy", () => {
  it("rejects prohibited legal conclusions and unsupported amounts", () => {
    const result = validateExplanation(
      "This term is illegal. You are owed S$9,999.00.",
      model,
      model.sources.map((source) => source.url)
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("Prohibited"))).toBe(true);
    expect(result.errors.some((error) => error.includes("Unsupported amount"))).toBe(true);
  });

  it("accepts an evidence-bound sentence with an allowed amount", () => {
    const result = validateExplanation(
      "The employee CPF estimate is S$1,200.00 using the confirmed facts.",
      model,
      model.sources.map((source) => source.url)
    );
    expect(result.ok).toBe(true);
  });

  it("drafts a concise HR message from selected questions", () => {
    const draft = draftHrMessage(model, ["q1"]);
    expect(draft.body).toContain("Is the bonus guaranteed?");
    expect(draft.body).toContain("S$6,000.00");
    expect(draft.body).not.toMatch(/illegal|wage theft/i);
  });
});
