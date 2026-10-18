import { describe, expect, it } from "vitest";
import { sgd } from "@job-checker/contracts";
import {
  CPF_RULES,
  calculateCpf,
  cpfAgeBandIndex,
  cpfInputFromFacts,
  prYearAt,
  resolveCpfRule,
  type CpfInput,
  type CpfRuleFixture,
  type CpfRuleMeta
} from "@job-checker/rules";
import { makeFacts } from "../../../tests/factories";

const meta: CpfRuleMeta = {
  ruleVersionId: "00000000-0000-4000-8000-000000000010",
  sourceVersionIds: ["00000000-0000-4000-8000-000000000011"],
  effectiveFrom: "2026-01-01"
};

function input(overrides: Partial<CpfInput> = {}): CpfInput {
  return {
    residency: "CITIZEN",
    arrangement: "FULL_STANDARD",
    dateOfBirth: "1992-05-15",
    wagePeriod: "2026-11",
    ordinaryWagesCents: 500_000,
    additionalWagesCents: 0,
    ...overrides
  };
}

function rule2026(): CpfRuleFixture {
  const rule = resolveCpfRule("2026-11-01", CPF_RULES);
  if (!rule) throw new Error("Missing 2026 rule");
  return rule;
}

function rule2027(): CpfRuleFixture {
  const rule = resolveCpfRule("2027-02-01", CPF_RULES);
  if (!rule) throw new Error("Missing 2027 rule");
  return rule;
}

describe("CPF effective-dated rule resolution", () => {
  it("selects the 2026 and 2027 rules exactly", () => {
    expect(resolveCpfRule("2025-12-31", CPF_RULES)).toBeUndefined();
    expect(resolveCpfRule("2026-01-01", CPF_RULES)?.semanticVersion).toBe("2026.1");
    expect(resolveCpfRule("2026-12-31", CPF_RULES)?.semanticVersion).toBe("2026.1");
    expect(resolveCpfRule("2027-01-01", CPF_RULES)?.semanticVersion).toBe("2027.1");
  });
});

describe("CPF calculation", () => {
  it("computes standard rates for a 30-year-old at S$5,000", () => {
    const evidence = calculateCpf(input(), rule2026(), meta);
    if (!evidence.output) throw new Error(JSON.stringify(evidence.applicability));
    expect(evidence.output.employeeContributionCents).toBe(100_000);
    expect(evidence.output.employerContributionCents).toBe(85_000);
    expect(evidence.output.totalContributionCents).toBe(185_000);
  });

  it("applies the Ordinary Wage ceiling", () => {
    const evidence = calculateCpf(input({ ordinaryWagesCents: 1_200_000 }), rule2026(), meta);
    if (!evidence.output) throw new Error("expected output");
    expect(evidence.output.ordinaryWagesSubjectCents).toBe(800_000);
    expect(evidence.output.employeeContributionCents).toBe(160_000);
    expect(evidence.output.employerContributionCents).toBe(136_000);
    expect(evidence.output.totalContributionCents).toBe(296_000);
  });

  it("rounds total CPF and drops employee cents", () => {
    const evidence = calculateCpf(input({ ordinaryWagesCents: 500_137 }), rule2026(), meta);
    if (!evidence.output) throw new Error("expected output");
    expect(evidence.output.totalContributionCents).toBe(185_100);
    expect(evidence.output.employeeContributionCents).toBe(100_027);
    expect(evidence.output.employerContributionCents).toBe(85_073);
    expect(
      evidence.output.employeeContributionCents + evidence.output.employerContributionCents
    ).toBe(evidence.output.totalContributionCents);
  });

  it("changes age band on the first day of the month after the birthday", () => {
    const may = calculateCpf(
      input({ dateOfBirth: "1971-05-15", wagePeriod: "2026-05" }),
      rule2026(),
      meta
    );
    const june = calculateCpf(
      input({ dateOfBirth: "1971-05-15", wagePeriod: "2026-06" }),
      rule2026(),
      meta
    );
    if (!may.output || !june.output) throw new Error("expected output");
    expect(may.output.ageBandLabel).toBe("55 and below");
    expect(june.output.ageBandLabel).toBe("Above 55 to 60");
    expect(june.output.employeeContributionCents).toBe(90_000);

    const juneBirthday = calculateCpf(
      input({ dateOfBirth: "1971-06-01", wagePeriod: "2026-06" }),
      rule2026(),
      meta
    );
    const julyBirthday = calculateCpf(
      input({ dateOfBirth: "1971-06-01", wagePeriod: "2026-07" }),
      rule2026(),
      meta
    );
    if (!juneBirthday.output || !julyBirthday.output) throw new Error("expected output");
    expect(juneBirthday.output.ageBandLabel).toBe("55 and below");
    expect(julyBirthday.output.ageBandLabel).toBe("Above 55 to 60");
  });

  it("uses the published 2027 senior rates", () => {
    const evidence = calculateCpf(
      input({ dateOfBirth: "1971-05-15", wagePeriod: "2027-06" }),
      rule2027(),
      meta
    );
    if (!evidence.output) throw new Error("expected output");
    expect(evidence.output.ageBandLabel).toBe("Above 55 to 60");
    expect(evidence.output.employeeRateBps).toBe(1900);
    expect(evidence.output.employerRateBps).toBe(1650);
    expect(evidence.output.employeeContributionCents).toBe(95_000);
    expect(evidence.output.employerContributionCents).toBe(82_500);
  });

  it("derives PR years and rejects an unsupported graduated arrangement", () => {
    expect(prYearAt("2024-08-01", "2024-08-15")).toBe(1);
    expect(prYearAt("2025-09-01", "2024-08-15")).toBe(2);
    expect(prYearAt("2026-09-01", "2024-08-15")).toBe(3);

    const full = calculateCpf(
      input({
        residency: "PR",
        prStatusEffectiveDate: "2025-01-15",
        wagePeriod: "2026-02",
        arrangement: "FULL_STANDARD"
      }),
      rule2026(),
      meta
    );
    expect(full.output?.prYear).toBe(2);
    expect(full.output?.employeeContributionCents).toBe(100_000);

    const graduated = calculateCpf(
      input({
        residency: "PR",
        prStatusEffectiveDate: "2025-01-15",
        wagePeriod: "2026-02",
        arrangement: "GRADUATED_STANDARD"
      }),
      rule2026(),
      meta
    );
    expect(graduated.output).toBeNull();
    expect(graduated.applicability.status).toBe("UNAVAILABLE");
  });

  it("returns UNAVAILABLE outside the full-rate wage floor", () => {
    const evidence = calculateCpf(input({ ordinaryWagesCents: 75_000 }), rule2026(), meta);
    expect(evidence.output).toBeNull();
    expect(evidence.applicability.status).toBe("UNAVAILABLE");
  });

  it("excludes additional wages when YTD is unknown and warns", () => {
    const evidence = calculateCpf(
      input({ ordinaryWagesCents: 500_000, additionalWagesCents: 500_000 }),
      rule2026(),
      meta
    );
    if (!evidence.output) throw new Error("expected output");
    expect(evidence.output.additionalWagesSubjectCents).toBe(0);
    expect(evidence.warnings.some((warning) => warning.includes("Additional wages"))).toBe(true);
  });

  it("satisfies invariants over a deterministic sample", () => {
    const ages = ["1992-05-15", "1971-05-15", "1964-05-15", "1959-05-15", "1952-05-15"];
    for (const dateOfBirth of ages) {
      for (let salary = 80_000; salary <= 1_200_000; salary += 37_000) {
        const evidence = calculateCpf(
          input({ ordinaryWagesCents: salary, dateOfBirth }),
          rule2026(),
          meta
        );
        if (!evidence.output) continue;
        expect(evidence.output.totalContributionCents).toBeGreaterThanOrEqual(
          evidence.output.employeeContributionCents
        );
        expect(
          evidence.output.employeeContributionCents + evidence.output.employerContributionCents
        ).toBe(evidence.output.totalContributionCents);
        expect(evidence.output.totalContributionCents % 100).toBe(0);
      }
    }
  });
});

describe("CPF from confirmed facts", () => {
  it("builds OW from basic salary and guaranteed OW allowances only", () => {
    const facts = makeFacts({
      basicMonthlySalary: sgd(600_000),
      compensationComponents: [
        {
          key: "transport",
          label: "Transport",
          amount: sgd(50_000),
          cadence: "MONTHLY",
          guarantee: "GUARANTEED",
          direction: "EARNING",
          cpfWageClass: "ORDINARY_WAGE"
        },
        {
          key: "bonus",
          label: "Bonus",
          amount: sgd(100_000),
          cadence: "ANNUAL",
          guarantee: "DISCRETIONARY",
          direction: "EARNING",
          cpfWageClass: "ADDITIONAL_WAGE"
        }
      ]
    });
    const cpf = cpfInputFromFacts(facts);
    expect(cpf.ordinaryWagesCents).toBe(650_000);
    expect(cpf.additionalWagesCents).toBe(0);
  });
});

describe("CPF age band helper", () => {
  it("returns the highest reached transition", () => {
    expect(cpfAgeBandIndex("2026-06-01", "1971-05-15", rule2026())).toBe(1);
    expect(cpfAgeBandIndex("2026-06-01", "1971-06-01", rule2026())).toBe(0);
    expect(cpfAgeBandIndex("2026-07-01", "1971-06-01", rule2026())).toBe(1);
  });
});
