import { describe, expect, it } from "vitest";
import {
  ConfirmedEmploymentFactsV1Schema,
  criticalFieldKeys,
  hashFieldValue,
  getFieldValue,
  parseMoneyToCents,
  validateForConfirmation,
  type ConfirmationManifest
} from "@job-checker/contracts";
import { screenInitialScope } from "@job-checker/contracts/scope";
import { makeFacts } from "../../../tests/factories";

describe("money parsing", () => {
  it("parses SGD amounts without floating point", () => {
    expect(parseMoneyToCents("6,500.50")).toBe(650_050);
    expect(parseMoneyToCents("S$8,000")).toBe(800_000);
    expect(parseMoneyToCents("12.345")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
  });
});

describe("employment facts schema", () => {
  it("accepts a complete confirmed fact set", () => {
    expect(ConfirmedEmploymentFactsV1Schema.safeParse(makeFacts()).success).toBe(true);
  });

  it("rejects an unknown field (strict schema)", () => {
    const result = ConfirmedEmploymentFactsV1Schema.safeParse({ ...makeFacts(), secret: "x" });
    expect(result.success).toBe(false);
  });

  it("requires an explicit confirmation for every critical field", () => {
    const facts = makeFacts();
    const manifest: ConfirmationManifest = {
      fields: criticalFieldKeys(facts)
        .filter((key) => key !== "workingDaysPerWeek")
        .map((key) => ({
          key,
          action: "ACCEPT",
          valueHash: hashFieldValue(
            key === "employer.legalName"
              ? facts.employer.legalName
              : (facts as Record<string, unknown>)[key]
          )
        }))
    };
    const issues = validateForConfirmation(facts, manifest);
    expect(issues.some((issue) => issue.field === "workingDaysPerWeek")).toBe(true);
  });

  it("allows optional hours to be confirmed absent but not a core field", () => {
    const facts = makeFacts({ workingHoursPerDay: undefined, workingDaysPerWeek: undefined });
    const manifest: ConfirmationManifest = {
      fields: criticalFieldKeys(facts).map((key) => ({
        key,
        action:
          key === "workingHoursPerDay" || key === "workingDaysPerWeek"
            ? ("CONFIRM_ABSENT" as const)
            : ("ACCEPT" as const),
        valueHash: hashFieldValue(getFieldValue(facts, key))
      }))
    };
    const issues = validateForConfirmation(facts, manifest);
    expect(
      issues.filter(
        (issue) => issue.field !== "workingHoursPerDay" && issue.field !== "workingDaysPerWeek"
      )
    ).toEqual([]);
  });

  it("rejects NEEDS_REVIEW CPF classification", () => {
    const facts = makeFacts({
      compensationComponents: [
        {
          key: "transport",
          label: "Transport allowance",
          amount: { currency: "SGD", cents: 50_000 },
          cadence: "MONTHLY",
          guarantee: "GUARANTEED",
          direction: "EARNING",
          cpfWageClass: "NEEDS_REVIEW"
        }
      ]
    });
    const manifest: ConfirmationManifest = {
      fields: criticalFieldKeys(facts).map((key) => ({
        key,
        action: "ACCEPT",
        valueHash: hashFieldValue(
          key === "employer.legalName"
            ? facts.employer.legalName
            : (facts as Record<string, unknown>)[key]
        )
      }))
    };
    const issues = validateForConfirmation(facts, manifest);
    expect(issues.some((issue) => issue.message.includes("Classify this component"))).toBe(true);
  });
});

describe("scope screening", () => {
  const base = {
    residency: "CITIZEN" as const,
    dateOfBirth: "1992-05-15",
    monthlySalary: "6500",
    englishDocument: true,
    shiftWork: false,
    commissionDominant: false,
    needsEquityOrTaxAdvice: false,
    needsWorkPassOrForeignWorkerAdvice: false
  };

  it("allows the designed range without warnings", () => {
    const decision = screenInitialScope(base);
    expect(decision.allowed).toBe(true);
    expect(decision.warnings).toEqual([]);
  });

  it("accepts a value just outside the range with a warning", () => {
    const decision = screenInitialScope({ ...base, monthlySalary: "13000" });
    expect(decision.allowed).toBe(true);
    expect(decision.warnings.length).toBe(1);
  });

  it("stops out-of-scope inputs with an official referral", () => {
    const decision = screenInitialScope({
      ...base,
      residency: "OTHER",
      shiftWork: true,
      needsWorkPassOrForeignWorkerAdvice: true
    });
    expect(decision.allowed).toBe(false);
    expect(decision.stops.length).toBeGreaterThan(1);
    expect(decision.referrals.some((item) => item.url.includes("mom.gov.sg"))).toBe(true);
  });

  it("stops salaries far outside the launch range", () => {
    expect(screenInitialScope({ ...base, monthlySalary: "1500" }).allowed).toBe(false);
    expect(screenInitialScope({ ...base, monthlySalary: "16000" }).allowed).toBe(false);
  });
});
