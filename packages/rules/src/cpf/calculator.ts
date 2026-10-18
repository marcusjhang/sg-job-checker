import type { Evidence } from "@job-checker/contracts";
import { formatCents } from "@job-checker/contracts";
import type { CpfInput, CpfResult, CpfRuleFixture } from "./types";

export type CpfRuleMeta = {
  ruleVersionId: string;
  sourceVersionIds: string[];
  effectiveFrom: string;
};

export function resolveCpfRule(
  asOf: string,
  rules: CpfRuleFixture[] = []
): CpfRuleFixture | undefined {
  return rules.find(
    (rule) => rule.effectiveFrom <= asOf && (rule.effectiveTo === null || asOf <= rule.effectiveTo)
  );
}

function addYears(date: string, years: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const nextYear = year + years;
  const maxDay = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
  return `${String(nextYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    Math.min(day, maxDay)
  ).padStart(2, "0")}`;
}

function firstDayOfNextMonth(date: string): string {
  const [year, month] = date.split("-").map(Number) as [number, number];
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
}

export function cpfAgeBandIndex(
  monthStart: string,
  dateOfBirth: string,
  rule: CpfRuleFixture
): number {
  let selected = 0;
  rule.ageBands.forEach((band, index) => {
    if (band.transitionAge === null) return;
    const bandStart = firstDayOfNextMonth(addYears(dateOfBirth, band.transitionAge));
    if (monthStart >= bandStart) selected = index;
  });
  return selected;
}

export function prYearAt(monthStart: string, prStatusEffectiveDate: string): 1 | 2 | 3 | null {
  const conversionMonthStart = `${prStatusEffectiveDate.slice(0, 7)}-01`;
  if (monthStart < conversionMonthStart) return null;
  const yearTwoStart = firstDayOfNextMonth(addYears(prStatusEffectiveDate, 1));
  const yearThreeStart = firstDayOfNextMonth(addYears(prStatusEffectiveDate, 2));
  if (monthStart >= yearThreeStart) return 3;
  if (monthStart >= yearTwoStart) return 2;
  return 1;
}

function roundDollarHalfUpFromScaled(numerator: number, denominator: number): number {
  const dollars = Math.floor((numerator + denominator / 2) / denominator);
  return dollars * 100;
}

function unavailable(
  input: CpfInput,
  rule: CpfRuleFixture,
  meta: CpfRuleMeta,
  reason: string
): Evidence<null> {
  return {
    key: "cpf.contribution",
    category: "CPF",
    title: "CPF contribution",
    inputs: { ...input },
    output: null,
    steps: [],
    ruleVersionId: meta.ruleVersionId,
    sourceVersionIds: meta.sourceVersionIds,
    effectiveDate: rule.effectiveFrom,
    applicability: { status: "UNAVAILABLE", reasons: [reason] },
    warnings: [reason]
  };
}

export function calculateCpf(
  input: CpfInput,
  rule: CpfRuleFixture,
  meta: CpfRuleMeta
): Evidence<CpfResult> | Evidence<null> {
  if (!/^\d{4}-\d{2}$/.test(input.wagePeriod)) {
    return unavailable(input, rule, meta, "The wage period must be a YYYY-MM month.");
  }
  const monthStart = `${input.wagePeriod}-01`;
  if (input.ordinaryWagesCents < 0 || input.additionalWagesCents < 0) {
    return unavailable(input, rule, meta, "Wages cannot be negative.");
  }

  const bandIndex = cpfAgeBandIndex(monthStart, input.dateOfBirth, rule);
  const band = rule.ageBands[bandIndex];
  if (!band) return unavailable(input, rule, meta, "No CPF age band applies.");

  let prYear: 1 | 2 | 3 = 3;
  if (input.residency === "PR") {
    if (!input.prStatusEffectiveDate) {
      return unavailable(input, rule, meta, "PRs must confirm the PR status start date.");
    }
    const computed = prYearAt(monthStart, input.prStatusEffectiveDate);
    if (computed === null) {
      return unavailable(
        input,
        rule,
        meta,
        "The wage period precedes the confirmed PR start date."
      );
    }
    prYear = computed;
  }

  if (
    prYear < 3 &&
    (input.arrangement === "GRADUATED_STANDARD" ||
      input.arrangement === "FULL_EMPLOYER_GRADUATED_EMPLOYEE" ||
      input.arrangement === "UNKNOWN")
  ) {
    return unavailable(
      input,
      rule,
      meta,
      "Graduated first/second-year PR CPF rates need the official Table 2/3 fixture, which is not approved in this release. Confirm the full-rate arrangement or seek advice."
    );
  }

  const ordinarySubject = Math.min(input.ordinaryWagesCents, rule.owCeilingCents);
  const warnings: string[] = [];
  const ytdOw = input.ytdOrdinaryWagesCents;
  const ytdAw = input.ytdAdditionalWagesCents;
  const awRoom =
    ytdOw === undefined || ytdAw === undefined
      ? null
      : Math.max(0, rule.awCeilingCents - ytdOw - ytdAw);

  let additionalSubject = 0;
  if (input.additionalWagesCents > 0) {
    if (awRoom === null) {
      warnings.push(
        "Additional wages (bonus/AWS) are excluded from this monthly CPF estimate because year-to-date wages were not confirmed. Annual bonus CPF depends on the Additional Wage ceiling."
      );
    } else {
      additionalSubject = Math.min(input.additionalWagesCents, awRoom);
      if (additionalSubject < input.additionalWagesCents) {
        warnings.push(
          "Additional wages exceed the remaining Additional Wage ceiling for the year."
        );
      }
    }
  }

  const totalWages = ordinarySubject + additionalSubject;
  if (totalWages <= 0) {
    return unavailable(input, rule, meta, "Total wages must be positive.");
  }
  if (totalWages <= rule.fullRateWageFloorCents) {
    return unavailable(
      input,
      rule,
      meta,
      "Monthly wages at or below S$750 use phased-in CPF bands that are outside this release."
    );
  }

  const totalRateBps = band.employerBps + band.employeeBps;
  const totalContributionCents = roundDollarHalfUpFromScaled(totalWages * totalRateBps, 1_000_000);
  const employeeContributionCents = Math.floor((totalWages * band.employeeBps) / 10_000);
  const employerContributionCents = totalContributionCents - employeeContributionCents;

  const result: CpfResult = {
    ageBandLabel: band.label,
    prYear,
    arrangementApplied: "FULL_STANDARD",
    ordinaryWagesSubjectCents: ordinarySubject,
    additionalWagesSubjectCents: additionalSubject,
    totalWagesSubjectCents: totalWages,
    totalContributionCents,
    employeeContributionCents,
    employerContributionCents,
    totalRateBps,
    employeeRateBps: band.employeeBps,
    employerRateBps: band.employerBps,
    owCeilingCents: rule.owCeilingCents,
    awCeilingCents: rule.awCeilingCents,
    awRoomCents: awRoom ?? 0,
    rounding:
      "Total CPF rounded to the nearest dollar; employee share cents dropped; employer share is total minus employee."
  };

  return {
    key: "cpf.contribution",
    category: "CPF",
    title: "CPF contribution",
    inputs: { ...input },
    output: result,
    steps: [
      {
        label: "Select the CPF contribution table",
        expression:
          input.residency === "CITIZEN"
            ? "Citizen → Table 1"
            : `PR year ${prYear} → Table ${prYear >= 3 ? 1 : prYear + 1}`,
        result: `${band.label}; employer ${band.employerBps / 100}%, employee ${band.employeeBps / 100}%`
      },
      {
        label: "Apply the Ordinary Wage ceiling",
        expression: `min(${formatCents(input.ordinaryWagesCents)}, ${formatCents(rule.owCeilingCents)})`,
        result: formatCents(ordinarySubject)
      },
      {
        label: "Apply the Additional Wage ceiling",
        expression:
          awRoom === null
            ? "Year-to-date wages unavailable"
            : `min(${formatCents(input.additionalWagesCents)}, max(0, ${formatCents(
                rule.awCeilingCents
              )} − YTD OW − YTD AW))`,
        result: formatCents(additionalSubject)
      },
      {
        label: "Total wages subject to CPF",
        expression: `${formatCents(ordinarySubject)} + ${formatCents(additionalSubject)}`,
        result: formatCents(totalWages)
      },
      {
        label: "Employee share (cents dropped)",
        expression: `${formatCents(totalWages)} × ${band.employeeBps / 100}%`,
        result: formatCents(employeeContributionCents)
      },
      {
        label: "Total contribution (rounded to nearest dollar)",
        expression: `${formatCents(totalWages)} × ${totalRateBps / 100}%`,
        result: formatCents(totalContributionCents)
      },
      {
        label: "Employer share",
        expression: `${formatCents(totalContributionCents)} − ${formatCents(employeeContributionCents)}`,
        result: formatCents(employerContributionCents)
      }
    ],
    ruleVersionId: meta.ruleVersionId,
    sourceVersionIds: meta.sourceVersionIds,
    effectiveDate: rule.effectiveFrom,
    applicability: { status: "APPLIES", reasons: [] },
    warnings
  };
}
