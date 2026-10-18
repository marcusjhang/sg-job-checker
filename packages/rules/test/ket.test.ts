import { describe, expect, it } from "vitest";
import { assessKet, type KetMeta } from "@job-checker/rules";
import { makeFacts } from "../../../tests/factories";

const meta: KetMeta = {
  ruleVersionId: "00000000-0000-4000-8000-000000000030",
  sourceVersionIds: ["00000000-0000-4000-8000-000000000031"],
  effectiveDate: "2026-01-01",
  sourceUrl: "https://www.mom.gov.sg/employment-practices/contract-of-service/key-employment-terms"
};

describe("KET completeness", () => {
  it("maps a complete permanent offer", () => {
    const checks = assessKet(makeFacts(), meta);
    const byItem = new Map(checks.map((check) => [check.output.itemNumber, check.output]));
    expect(byItem.get(1)?.status).toBe("PRESENT");
    expect(byItem.get(5)?.status).toBe("NOT_APPLICABLE");
    expect(byItem.get(6)?.status).toBe("PRESENT");
    expect(byItem.get(18)?.status).toBe("PRESENT");
    expect(byItem.get(8)?.status).toBe("PRESENT");
  });

  it("marks each missing item without declaring anything unlawful", () => {
    const checks = assessKet(
      makeFacts({
        workingHoursPerDay: undefined,
        workingDaysPerWeek: undefined,
        restDay: undefined,
        salaryPeriod: undefined,
        leave: undefined,
        medicalBenefits: undefined,
        probation: undefined,
        noticePeriod: undefined
      }),
      meta
    );
    const missing = checks.filter((check) => check.output.status === "MISSING");
    expect(missing.map((check) => check.output.itemNumber)).toEqual(
      expect.arrayContaining([6, 7, 14, 15, 16, 17])
    );
    for (const check of missing) {
      expect(check.warnings.join(" ")).not.toMatch(/\bis (illegal|unlawful)\b/i);
      expect(check.output.action).toBeTruthy();
    }
  });

  it("requires a fixed-term end date", () => {
    const checks = assessKet(
      makeFacts({ employmentDuration: { kind: "FIXED_TERM", endDate: "2027-12-31" } }),
      meta
    );
    expect(checks.find((check) => check.output.itemNumber === 5)?.output.status).toBe("PRESENT");
  });

  it("treats overtime items as not applicable for managers and executives", () => {
    const checks = assessKet(
      makeFacts({ employmentActRoleClassification: "MANAGER_EXECUTIVE", overtime: undefined }),
      meta
    );
    expect(checks.find((check) => check.output.itemNumber === 11)?.output.status).toBe(
      "NOT_APPLICABLE"
    );
    expect(checks.find((check) => check.output.itemNumber === 12)?.output.status).toBe(
      "NOT_APPLICABLE"
    );
  });
});
