import { z } from "zod";
import { parseMoneyToCents } from "./money";

export const ScopeAnswersSchema = z
  .object({
    residency: z.enum(["CITIZEN", "PR", "OTHER"]),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    monthlySalary: z.string().min(1).max(40),
    englishDocument: z.boolean(),
    shiftWork: z.boolean(),
    commissionDominant: z.boolean(),
    needsEquityOrTaxAdvice: z.boolean(),
    needsWorkPassOrForeignWorkerAdvice: z.boolean()
  })
  .strict();

export type ScopeAnswers = z.infer<typeof ScopeAnswersSchema>;

export type ScopeDecision = {
  allowed: boolean;
  stops: string[];
  warnings: string[];
  referrals: Array<{ label: string; url: string }>;
};

/**
 * Launch policy for salary is explicit:
 * - S$2,500–S$12,000 is the designed range.
 * - S$2,000–S$15,000 is accepted with a scope warning (edge cases still work).
 * - Below S$2,000 or above S$15,000 stops; low-wage and senior-executive rules
 *   are not in this release.
 */
export function screenInitialScope(answers: ScopeAnswers): ScopeDecision {
  const stops: string[] = [];
  const warnings: string[] = [];
  const referrals: Array<{ label: string; url: string }> = [];

  if (answers.residency === "OTHER") {
    stops.push("This release supports Singapore Citizens and Permanent Residents only.");
    referrals.push({
      label: "MOM work pass information",
      url: "https://www.mom.gov.sg/passes-and-permits"
    });
  }
  if (!answers.englishDocument) {
    stops.push("Phase 1 supports English-language documents only.");
  }
  if (answers.shiftWork) {
    stops.push("Shift schedules and shift overtime are outside this release.");
    referrals.push({
      label: "MOM hours of work, overtime and rest days",
      url: "https://www.mom.gov.sg/employment-practices/hours-of-work-overtime-and-rest-days"
    });
  }
  if (answers.commissionDominant) {
    stops.push("Commission-dominant roles are outside this release.");
  }
  if (answers.needsEquityOrTaxAdvice) {
    stops.push("Equity valuation and tax advice are outside this release.");
    referrals.push({
      label: "IRAS individual income tax",
      url: "https://www.iras.gov.sg/taxes/individual-income-tax"
    });
  }
  if (answers.needsWorkPassOrForeignWorkerAdvice) {
    stops.push("Work-pass eligibility and foreign-worker levies are outside this release.");
  }

  const salaryCents = parseMoneyToCents(answers.monthlySalary);
  if (salaryCents === null) {
    stops.push("Enter the monthly basic salary as a Singapore-dollar amount.");
  } else if (salaryCents < 200_000 || salaryCents > 1_500_000) {
    stops.push("Monthly basic salary is outside the supported S$2,000–S$15,000 launch range.");
  } else if (salaryCents < 250_000 || salaryCents > 1_200_000) {
    warnings.push(
      "This salary is just outside the designed S$2,500–S$12,000 range. Results may be less complete."
    );
  }

  const dob = new Date(`${answers.dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.valueOf())) {
    stops.push("Enter a valid date of birth.");
  } else {
    const now = new Date();
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const birthdayThisYear = new Date(
      Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate())
    );
    if (now < birthdayThisYear) age -= 1;
    if (age < 18) stops.push("This service is for adults aged 18 and above.");
    if (age > 65)
      warnings.push("CPF age bands above 65 are supported, but the designed user range is 20–45.");
  }

  return { allowed: stops.length === 0, stops, warnings, referrals };
}
