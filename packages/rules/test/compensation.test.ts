import { describe, expect, it } from "vitest";
import { sgd } from "@job-checker/contracts";
import {
  calculateCompensation,
  calculateCpf,
  CPF_RULES,
  cpfInputFromFacts,
  resolveCpfRule
} from "@job-checker/rules";
import { makeFacts } from "../../../tests/factories";

const meta = {
  ruleVersionId: "00000000-0000-4000-8000-000000000020",
  sourceVersionIds: ["00000000-0000-4000-8000-000000000021"],
  effectiveDate: "2026-01-01"
};

function cpfFor(facts = makeFacts()) {
  const rule = resolveCpfRule(`${facts.compensationPeriod}-01`, CPF_RULES);
  if (!rule) throw new Error("Missing CPF rule");
  return calculateCpf(cpfInputFromFacts(facts), rule, {
    ruleVersionId: meta.ruleVersionId,
    sourceVersionIds: meta.sourceVersionIds,
    effectiveFrom: rule.effectiveFrom
  });
}

describe("compensation", () => {
  it("computes basic-only contractual cash, take-home, and annual guaranteed", () => {
    const facts = makeFacts({ basicMonthlySalary: sgd(600_000) });
    const evidence = calculateCompensation(facts, cpfFor(facts), meta);
    expect(evidence.output?.monthlyContractualCashCents).toBe(600_000);
    expect(evidence.output?.employeeCpfCents).toBe(120_000);
    expect(evidence.output?.monthlyTakeHomeCents).toBe(480_000);
    expect(evidence.output?.annualGuaranteedCashCents).toBe(7_200_000);
  });

  it("includes guaranteed monthly allowances, deducts fixed deductions, and excludes discretionary bonus", () => {
    const facts = makeFacts({
      basicMonthlySalary: sgd(600_000),
      compensationComponents: [
        {
          key: "transport",
          label: "Transport allowance",
          amount: sgd(50_000),
          cadence: "MONTHLY",
          guarantee: "GUARANTEED",
          direction: "EARNING",
          cpfWageClass: "ORDINARY_WAGE"
        },
        {
          key: "cdac",
          label: "Fixed deduction",
          amount: sgd(10_000),
          cadence: "MONTHLY",
          guarantee: "GUARANTEED",
          direction: "DEDUCTION",
          cpfWageClass: "EXCLUDED"
        },
        {
          key: "bonus",
          label: "Performance bonus",
          amount: sgd(1_000_000),
          cadence: "ANNUAL",
          guarantee: "DISCRETIONARY",
          direction: "EARNING",
          cpfWageClass: "ADDITIONAL_WAGE"
        }
      ]
    });
    const evidence = calculateCompensation(facts, cpfFor(facts), meta);
    if (!evidence.output) throw new Error("expected output");
    expect(evidence.output.monthlyContractualCashCents).toBe(650_000);
    expect(evidence.output.monthlyFixedDeductionsCents).toBe(10_000);
    expect(evidence.output.employeeCpfCents).toBe(130_000);
    expect(evidence.output.monthlyTakeHomeCents).toBe(510_000);
    expect(evidence.output.annualGuaranteedCashCents).toBe(7_800_000);
    expect(
      evidence.output.excludedComponents.some((item) => item.label === "Performance bonus")
    ).toBe(true);
    expect(evidence.output.clarifications.length).toBeGreaterThan(0);
  });

  it("includes a guaranteed AWS but never an indeterminate bonus", () => {
    const facts = makeFacts({
      compensationComponents: [
        {
          key: "aws",
          label: "13th month AWS",
          amount: sgd(600_000),
          cadence: "ANNUAL",
          guarantee: "GUARANTEED",
          direction: "EARNING",
          cpfWageClass: "ADDITIONAL_WAGE"
        },
        {
          key: "variable",
          label: "Variable bonus",
          amount: sgd(900_000),
          cadence: "ANNUAL",
          guarantee: "INDETERMINATE",
          direction: "EARNING",
          cpfWageClass: "ADDITIONAL_WAGE"
        }
      ]
    });
    const evidence = calculateCompensation(facts, cpfFor(facts), meta);
    if (!evidence.output) throw new Error("expected output");
    expect(evidence.output.annualGuaranteedCashCents).toBe(7_800_000);
    expect(
      evidence.output.excludedComponents.find((item) => item.label === "Variable bonus")?.reason
    ).toContain("Guarantee not confirmed");
  });

  it("never invents a formula-based component and asks for the formula", () => {
    const facts = makeFacts({
      compensationComponents: [
        {
          key: "formula",
          label: "Variable allowance",
          amount: sgd(0),
          cadence: "FORMULA",
          guarantee: "GUARANTEED",
          direction: "EARNING",
          cpfWageClass: "ORDINARY_WAGE",
          formulaText: "1 month per completed year"
        }
      ]
    });
    const evidence = calculateCompensation(facts, cpfFor(facts), meta);
    if (!evidence.output) throw new Error("expected output");
    expect(evidence.output.annualGuaranteedCashCents).toBe(7_200_000);
    expect(
      evidence.output.clarifications.some((item) => item.includes("Resolve the formula"))
    ).toBe(true);
  });

  it("keeps take-home unavailable when CPF is unavailable", () => {
    const facts = makeFacts({
      employeeResidency: "PR",
      prStatusEffectiveDate: "2025-01-15",
      cpfContributionArrangement: "GRADUATED_STANDARD",
      compensationPeriod: "2026-02"
    });
    const evidence = calculateCompensation(facts, cpfFor(facts), meta);
    expect(evidence.output?.monthlyTakeHomeCents).toBeNull();
    expect(evidence.output?.monthlyContractualCashCents).toBe(600_000);
  });

  it("excludes reimbursements from guaranteed compensation and CPF", () => {
    const facts = makeFacts({
      basicMonthlySalary: sgd(600_000),
      compensationComponents: [
        {
          key: "reimbursement",
          label: "Travel reimbursement",
          amount: sgd(30_000),
          cadence: "MONTHLY",
          guarantee: "GUARANTEED",
          direction: "EARNING",
          cpfWageClass: "EXCLUDED"
        }
      ]
    });
    const evidence = calculateCompensation(facts, cpfFor(facts), meta);
    if (!evidence.output) throw new Error("expected output");
    expect(evidence.output.monthlyContractualCashCents).toBe(600_000);
    expect(evidence.output.annualGuaranteedCashCents).toBe(7_200_000);
    expect(evidence.output.cpfOrdinaryWagesCents).toBe(600_000);
    expect(
      evidence.output.excludedComponents.some((item) => item.label === "Travel reimbursement")
    ).toBe(true);
  });
});
