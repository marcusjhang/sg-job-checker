import { describe, expect, it } from "vitest";
import { sgd } from "@job-checker/contracts";
import {
  assessEmploymentActCoverage,
  assessLeave,
  assessOvertime,
  calculateHourlyDailyRates,
  type EaCoverageResult,
  type EaMeta,
  type EaRateResult
} from "@job-checker/rules";
import { makeFacts } from "../../../tests/factories";

const meta: EaMeta = {
  ruleVersionId: "00000000-0000-4000-8000-000000000040",
  sourceVersionIds: ["00000000-0000-4000-8000-000000000041"],
  effectiveDate: "2026-01-01"
};

describe("Employment Act coverage", () => {
  it("applies the exact Part IV salary thresholds", () => {
    expect(
      assessEmploymentActCoverage(
        makeFacts({ employmentActRoleClassification: "WORKMAN", basicMonthlySalary: sgd(450_000) }),
        meta
      ).output?.covered
    ).toBe("YES");
    expect(
      assessEmploymentActCoverage(
        makeFacts({ employmentActRoleClassification: "WORKMAN", basicMonthlySalary: sgd(450_001) }),
        meta
      ).output?.covered
    ).toBe("NO");
    expect(
      assessEmploymentActCoverage(
        makeFacts({
          employmentActRoleClassification: "NON_WORKMAN",
          basicMonthlySalary: sgd(260_000)
        }),
        meta
      ).output?.covered
    ).toBe("YES");
    expect(
      assessEmploymentActCoverage(
        makeFacts({
          employmentActRoleClassification: "NON_WORKMAN",
          basicMonthlySalary: sgd(260_001)
        }),
        meta
      ).output?.covered
    ).toBe("NO");
  });

  it("excludes managers and executives and does not guess unknown roles", () => {
    expect(
      assessEmploymentActCoverage(
        makeFacts({ employmentActRoleClassification: "MANAGER_EXECUTIVE" }),
        meta
      ).output?.covered
    ).toBe("NO");
    expect(
      assessEmploymentActCoverage(makeFacts({ employmentActRoleClassification: "UNKNOWN" }), meta)
        .output?.covered
    ).toBe("INDETERMINATE");
  });
});

describe("hourly and daily rates", () => {
  it("uses (12 × monthly) / (52 × 44) and the confirmed daily hours", () => {
    const evidence = calculateHourlyDailyRates(
      makeFacts({ basicMonthlySalary: sgd(400_000) }),
      meta
    );
    expect(evidence.output?.hourlyRateCents).toBe(2_098);
    expect(evidence.output?.dailyRateCents).toBe(16_784);
    expect(evidence.output?.formula).toContain("52 × 44");
  });
});

describe("overtime context", () => {
  function coverage(
    facts = makeFacts({
      employmentActRoleClassification: "WORKMAN",
      basicMonthlySalary: sgd(400_000)
    })
  ) {
    return assessEmploymentActCoverage(facts, meta);
  }
  function rate(facts = makeFacts({ basicMonthlySalary: sgd(400_000) })) {
    return calculateHourlyDailyRates(facts, meta);
  }

  it("applies the 1.5× minimum for a covered workman and computes confirmed hours", () => {
    const facts = makeFacts({
      employmentActRoleClassification: "WORKMAN",
      basicMonthlySalary: sgd(400_000),
      overtime: { rate: "1.5x", period: "Monthly" }
    });
    const evidence = assessOvertime(
      facts,
      coverage(facts) as never,
      rate(facts) as never,
      meta,
      "10"
    );
    expect(evidence.output?.applies).toBe("YES");
    expect(evidence.output?.minimumOvertimeRateCents).toBe(3_147);
    expect(evidence.output?.overtimePayCents).toBe(31_470);
    expect(evidence.output?.statedRateAssessment).toContain("meets");
  });

  it("flags a stated rate below 1.5× as a clarification, not a legal conclusion", () => {
    const facts = makeFacts({
      employmentActRoleClassification: "WORKMAN",
      basicMonthlySalary: sgd(400_000),
      overtime: { rate: "1.2x" }
    });
    const evidence = assessOvertime(
      facts,
      coverage(facts) as never,
      rate(facts) as never,
      meta,
      "5"
    );
    expect(evidence.output?.statedRateAssessment).toContain("appears below");
    expect(evidence.warnings.join(" ")).not.toMatch(/illegal|unlawful/i);
  });

  it("caps the overtime hourly context for non-workmen at S$13.60", () => {
    const facts = makeFacts({
      employmentActRoleClassification: "NON_WORKMAN",
      basicMonthlySalary: sgd(260_000),
      overtime: { rate: "1.5x" }
    });
    const evidence = assessOvertime(
      facts,
      coverage(facts) as never,
      rate(facts) as never,
      meta,
      "2"
    );
    expect(evidence.output?.minimumOvertimeRateCents).toBe(2_040);
    expect(evidence.warnings.join(" ")).toContain("S$13.60");
  });

  it("does not apply to a non-covered manager", () => {
    const facts = makeFacts({ employmentActRoleClassification: "MANAGER_EXECUTIVE" });
    const evidence = assessOvertime(
      facts,
      coverage(facts) as never,
      rate(facts) as never,
      meta,
      null
    );
    expect(evidence.output?.applies).toBe("NO");
  });
});

describe("leave context", () => {
  it("shows no annual or paid sick leave before three months", () => {
    const evidence = assessLeave(makeFacts({ startDate: "2026-12-01" }), meta, "2026-11-01");
    expect(evidence.output?.serviceMonths).toBe(0);
    expect(evidence.output?.annualStatutoryDays).toBe(0);
    expect(evidence.output?.sickOutpatientDays).toBe(0);
  });

  it("pro-rates annual leave and paid sick leave for new hires", () => {
    const threeMonths = assessLeave(makeFacts({ startDate: "2026-01-01" }), meta, "2026-04-01");
    expect(threeMonths.output?.serviceMonths).toBe(3);
    expect(threeMonths.output?.annualStatutoryDays).toBe(1.75);
    expect(threeMonths.output?.sickOutpatientDays).toBe(5);
    expect(threeMonths.output?.sickHospitalisationDays).toBe(15);

    const fourMonths = assessLeave(makeFacts({ startDate: "2026-01-01" }), meta, "2026-05-01");
    expect(fourMonths.output?.sickOutpatientDays).toBe(8);
    expect(fourMonths.output?.sickHospitalisationDays).toBe(30);

    const fiveMonths = assessLeave(makeFacts({ startDate: "2026-01-01" }), meta, "2026-06-01");
    expect(fiveMonths.output?.sickOutpatientDays).toBe(11);
    expect(fiveMonths.output?.sickHospitalisationDays).toBe(45);
  });

  it("moves to 14 annual days from the eighth year and 14/60 sick days after six months", () => {
    const evidence = assessLeave(makeFacts({ startDate: "2018-01-01" }), meta, "2026-06-01");
    expect(evidence.output?.serviceMonths).toBe(101);
    expect(evidence.output?.annualStatutoryDays).toBe(14);
    expect(evidence.output?.sickOutpatientDays).toBe(14);
    expect(evidence.output?.sickHospitalisationDays).toBe(60);
  });
});

describe("coverage evidence types", () => {
  it("keeps typed evidence for downstream rendering", () => {
    const coverage = assessEmploymentActCoverage(makeFacts(), meta);
    const result = coverage.output as EaCoverageResult;
    const rate = calculateHourlyDailyRates(makeFacts(), meta).output as EaRateResult;
    expect(result.covered).toBeDefined();
    expect(rate.hourlyRateExact).toMatch(/^\d+\.\d{4}$/);
  });
});
