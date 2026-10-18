import type { ConfirmedEmploymentFactsV1, Evidence } from "@job-checker/contracts";
import { formatCents } from "@job-checker/contracts";

export type EaCoverageResult = {
  covered: "YES" | "NO" | "INDETERMINATE";
  reason: string;
  category: string;
  basicMonthlySalaryCents: number;
  thresholdCents: number | null;
};

export type EaRateResult = {
  hourlyRateCents: number;
  hourlyRateExact: string;
  dailyRateCents: number | null;
  formula: string;
  hoursPerWeekUsed: string;
  daysPerWeekUsed: string | null;
};

export type EaOvertimeResult = {
  applies: "YES" | "NO" | "INDETERMINATE" | "UNAVAILABLE";
  hourlyRateCents: number | null;
  minimumOvertimeRateCents: number | null;
  hours: number | null;
  overtimePayCents: number | null;
  statedRate: string | null;
  statedRateAssessment: string;
  capHours: number;
  warning: string | null;
};

export type EaLeaveResult = {
  serviceMonths: number;
  annualStatutoryDays: number;
  annualContractualDays: number | null;
  annualAssessment: string;
  sickOutpatientDays: number;
  sickHospitalisationDays: number;
  sickContractual: { outpatient: number | null; hospitalisation: number | null };
  sickAssessment: string;
  note: string;
};

export type EaMeta = {
  ruleVersionId: string;
  sourceVersionIds: string[];
  effectiveDate: string;
};

const PART_IV_WORKMAN_LIMIT_CENTS = 450_000;
const PART_IV_NON_WORKMAN_LIMIT_CENTS = 260_000;
const OVERTIME_MULTIPLIER_BPS = 15_000;
const OVERTIME_CAP_HOURS = 72;

export function assessEmploymentActCoverage(
  facts: ConfirmedEmploymentFactsV1,
  meta: EaMeta
): Evidence<EaCoverageResult> {
  const salary = facts.basicMonthlySalary.cents;
  let covered: EaCoverageResult["covered"] = "INDETERMINATE";
  let reason = "Employment Act role classification is unknown. Confirm the role with HR.";
  let threshold: number | null = null;
  let category = "UNKNOWN";

  if (facts.employmentActRoleClassification === "MANAGER_EXECUTIVE") {
    covered = "NO";
    category = "MANAGER_EXECUTIVE";
    reason =
      "Managers and executives are not covered by Part IV hours/overtime provisions. The general Employment Act still applies.";
  } else if (facts.employmentActRoleClassification === "WORKMAN") {
    category = "WORKMAN";
    threshold = PART_IV_WORKMAN_LIMIT_CENTS;
    covered = salary <= threshold ? "YES" : "NO";
    reason =
      salary <= threshold
        ? "Workman earning at or below S$4,500 basic monthly salary is covered by Part IV."
        : "Workman earning above S$4,500 basic monthly salary is outside Part IV overtime coverage.";
  } else if (facts.employmentActRoleClassification === "NON_WORKMAN") {
    category = "NON_WORKMAN";
    threshold = PART_IV_NON_WORKMAN_LIMIT_CENTS;
    covered = salary <= threshold ? "YES" : "NO";
    reason =
      salary <= threshold
        ? "Non-workman earning at or below S$2,600 basic monthly salary is covered by Part IV."
        : "Non-workman earning above S$2,600 basic monthly salary is outside Part IV overtime coverage.";
  }

  return {
    key: "employment-act.coverage",
    category: "EMPLOYMENT_ACT",
    title: "Part IV employment coverage",
    inputs: {
      roleClassification: facts.employmentActRoleClassification,
      basicMonthlySalaryCents: salary
    },
    output: {
      covered,
      reason,
      category,
      basicMonthlySalaryCents: salary,
      thresholdCents: threshold
    },
    steps: [
      {
        label: "Identify worker category",
        result: category
      },
      {
        label: "Apply the Part IV basic-salary threshold",
        expression:
          threshold === null ? "No threshold applies" : `salary ≤ ${formatCents(threshold)}`,
        result: covered
      }
    ],
    ruleVersionId: meta.ruleVersionId,
    sourceVersionIds: meta.sourceVersionIds,
    effectiveDate: meta.effectiveDate,
    applicability:
      covered === "INDETERMINATE"
        ? { status: "INDETERMINATE", reasons: [reason] }
        : covered === "YES"
          ? { status: "APPLIES", reasons: [reason] }
          : { status: "DOES_NOT_APPLY", reasons: [reason] },
    warnings: covered === "INDETERMINATE" ? [reason] : []
  };
}

export function calculateHourlyDailyRates(
  facts: ConfirmedEmploymentFactsV1,
  meta: EaMeta
): Evidence<EaRateResult> {
  const monthly = facts.basicMonthlySalary.cents;
  const hoursPerDay = facts.workingHoursPerDay ? Number(facts.workingHoursPerDay) : null;
  const daysPerWeek = facts.workingDaysPerWeek ? Number(facts.workingDaysPerWeek) : null;

  const microCents = Math.round((monthly * 12 * 1_000_000) / (52 * 44));
  const hourlyCents = Math.round(microCents / 1_000_000);
  const exact = (microCents / 1_000_000).toFixed(4);
  const dailyRateCents =
    hoursPerDay !== null && hoursPerDay > 0 ? Math.round(hourlyCents * hoursPerDay) : null;

  return {
    key: "employment-act.rate-of-pay",
    category: "EMPLOYMENT_ACT",
    title: "Hourly and daily basic rate",
    inputs: {
      basicMonthlySalaryCents: monthly,
      workingHoursPerDay: facts.workingHoursPerDay ?? null,
      workingDaysPerWeek: facts.workingDaysPerWeek ?? null
    },
    output: {
      hourlyRateCents: hourlyCents,
      hourlyRateExact: exact,
      dailyRateCents,
      formula: "(12 × monthly basic salary) ÷ (52 × 44)",
      hoursPerWeekUsed: "44",
      daysPerWeekUsed: daysPerWeek === null ? null : String(daysPerWeek)
    },
    steps: [
      {
        label: "Apply the monthly-rated hourly basic rate formula",
        expression: `(12 × ${formatCents(monthly)}) ÷ (52 × 44)`,
        result: `S$${exact} per hour`
      },
      {
        label: "Daily basic rate (contract hours)",
        expression:
          hoursPerDay === null
            ? "Contractual daily hours not confirmed"
            : `${exact} × ${hoursPerDay}`,
        result: dailyRateCents === null ? "Unavailable" : formatCents(dailyRateCents)
      }
    ],
    ruleVersionId: meta.ruleVersionId,
    sourceVersionIds: meta.sourceVersionIds,
    effectiveDate: meta.effectiveDate,
    applicability: {
      status: hoursPerDay === null ? "INDETERMINATE" : "APPLIES",
      reasons: hoursPerDay === null ? ["Contractual daily hours were not confirmed."] : []
    },
    warnings: [
      "This is a basic-rate context, not a total salary calculation. Contractual terms may be more favourable."
    ]
  };
}

function parseHours(value: string | null): number | null {
  if (!value) return null;
  const match = /(\d{1,3}(?:\.\d{1,2})?)/.exec(value);
  if (!match?.[1]) return null;
  const hours = Number(match[1]);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

export function assessOvertime(
  facts: ConfirmedEmploymentFactsV1,
  coverage: Evidence<EaCoverageResult>,
  rate: Evidence<EaRateResult>,
  meta: EaMeta,
  overtimeHours: string | null
): Evidence<EaOvertimeResult> {
  const covered = coverage.output?.covered;
  const hours = parseHours(overtimeHours);
  const statedRate = facts.overtime?.rate ?? null;
  const hourly = rate.output?.hourlyRateCents ?? null;
  let applies: EaOvertimeResult["applies"] = "INDETERMINATE";
  let warning: string | null = null;

  if (covered === "NO") applies = "NO";
  else if (covered === "YES") applies = "YES";
  else if (covered === "INDETERMINATE") applies = "INDETERMINATE";
  else applies = "UNAVAILABLE";

  const minimumRate =
    hourly === null ? null : Math.round((hourly * OVERTIME_MULTIPLIER_BPS) / 10_000);
  const overtimePay =
    minimumRate === null || hours === null ? null : Math.round((minimumRate * hours * 100) / 100);

  let assessment = "No numeric rate stated.";
  if (statedRate) {
    const multiplier = /(\d+(?:\.\d+)?)\s*(?:x|times)/i.exec(statedRate);
    if (multiplier?.[1]) {
      const value = Number(multiplier[1]);
      assessment =
        value >= 1.5
          ? `Stated multiplier ${value}× meets the 1.5× minimum context.`
          : `Stated multiplier ${value}× appears below the 1.5× minimum context. Clarify with HR.`;
      if (value < 1.5) warning = assessment;
    } else {
      const dollar = /\$\s*(\d+(?:\.\d{1,2})?)/.exec(statedRate);
      if (dollar?.[1] && minimumRate !== null) {
        const statedCents = Math.round(Number(dollar[1]) * 100);
        assessment =
          statedCents >= minimumRate
            ? `Stated S$${dollar[1]}/hour meets the 1.5× minimum context.`
            : `Stated S$${dollar[1]}/hour appears below the 1.5× minimum context. Clarify with HR.`;
        if (statedCents < minimumRate) warning = assessment;
      } else {
        assessment = "The stated overtime rate is not numeric. Ask HR for the rate and basis.";
        applies = applies === "YES" ? "INDETERMINATE" : applies;
      }
    }
  }

  if (hours !== null && hours > OVERTIME_CAP_HOURS) {
    warning = `Confirmed overtime hours (${hours}) exceed the 72-hour monthly limit context. Clarify with HR.`;
  }

  return {
    key: "employment-act.overtime",
    category: "EMPLOYMENT_ACT",
    title: "Overtime pay context",
    inputs: {
      coverage: covered ?? null,
      hourlyRateCents: hourly,
      statedRate,
      overtimeHours: hours
    },
    output: {
      applies,
      hourlyRateCents: hourly,
      minimumOvertimeRateCents: minimumRate,
      hours,
      overtimePayCents: overtimePay,
      statedRate,
      statedRateAssessment: assessment,
      capHours: OVERTIME_CAP_HOURS,
      warning
    },
    steps: [
      {
        label: "Confirm Part IV coverage",
        result: covered ?? "Unavailable"
      },
      {
        label: "Minimum overtime rate context",
        expression: "hourly basic rate × 1.5",
        result: minimumRate === null ? "Unavailable" : formatCents(minimumRate)
      },
      {
        label: "Overtime pay for confirmed hours",
        expression:
          minimumRate === null || hours === null
            ? "Hours or hourly rate unavailable"
            : `${formatCents(minimumRate)} × ${hours} hours`,
        result: overtimePay === null ? "Unavailable" : formatCents(overtimePay)
      }
    ],
    ruleVersionId: meta.ruleVersionId,
    sourceVersionIds: meta.sourceVersionIds,
    effectiveDate: meta.effectiveDate,
    applicability:
      applies === "YES"
        ? { status: "APPLIES", reasons: [] }
        : applies === "NO"
          ? {
              status: "DOES_NOT_APPLY",
              reasons: [coverage.output?.reason ?? "Not covered by Part IV."]
            }
          : applies === "INDETERMINATE"
            ? {
                status: "INDETERMINATE",
                reasons: ["Coverage or rate cannot be resolved from confirmed facts."]
              }
            : { status: "UNAVAILABLE", reasons: ["Coverage evidence is unavailable."] },
    warnings: warning ? [warning] : []
  };
}

function completedMonths(startDate: string, asOf: string): number {
  if (asOf < startDate) return 0;
  const [sy, sm] = startDate.split("-").map(Number) as [number, number];
  const [ay, am] = asOf.split("-").map(Number) as [number, number];
  return Math.max(0, (ay - sy) * 12 + (am - sm));
}

function parseDays(value: string | undefined): number | null {
  if (!value) return null;
  const match = /(\d{1,3})/.exec(value);
  if (!match?.[1]) return null;
  const days = Number(match[1]);
  return Number.isFinite(days) ? days : null;
}

export function assessLeave(
  facts: ConfirmedEmploymentFactsV1,
  meta: EaMeta,
  asOf = new Date().toISOString().slice(0, 10)
): Evidence<EaLeaveResult> {
  const serviceMonths = completedMonths(facts.startDate, asOf);
  const serviceYears = Math.floor(serviceMonths / 12);
  const annualStatutory = Math.min(14, 7 + Math.max(0, serviceYears));
  const contractualAnnual = parseDays(facts.leave?.annual);
  const sickOutpatient = serviceMonths >= 6 ? 14 : 0;
  const sickHospitalisation = serviceMonths >= 6 ? 60 : 0;
  const contractualSick = parseDays(facts.leave?.sick);
  const contractualHospitalisation = parseDays(facts.leave?.hospitalisation);

  let annualAssessment = "No contractual annual leave figure was confirmed.";
  if (contractualAnnual !== null) {
    annualAssessment =
      contractualAnnual >= annualStatutory
        ? `Contractual ${contractualAnnual} days meets the statutory context for ${serviceYears} completed year(s).`
        : `Contractual ${contractualAnnual} days appears below the statutory context for ${serviceYears} completed year(s). Clarify with HR.`;
  }

  let sickAssessment =
    serviceMonths >= 6
      ? "Statutory paid sick leave context: 14 outpatient and 60 hospitalisation days (inclusive)."
      : "Paid sick leave generally requires 6 months' service; the contract may offer more. Confirm the paid-sick-leave terms.";
  if (contractualSick !== null) {
    sickAssessment =
      contractualSick >= sickOutpatient
        ? `Contractual ${contractualSick} outpatient days meets the statutory context.`
        : `Contractual ${contractualSick} outpatient days appears below the statutory context. Clarify with HR.`;
  }

  return {
    key: "employment-act.leave",
    category: "EMPLOYMENT_ACT",
    title: "Leave entitlement context",
    inputs: {
      startDate: facts.startDate,
      serviceMonths,
      contractualAnnual: facts.leave?.annual ?? null,
      contractualSick: facts.leave?.sick ?? null,
      contractualHospitalisation: facts.leave?.hospitalisation ?? null
    },
    output: {
      serviceMonths,
      annualStatutoryDays: annualStatutory,
      annualContractualDays: contractualAnnual,
      annualAssessment,
      sickOutpatientDays: sickOutpatient,
      sickHospitalisationDays: sickHospitalisation,
      sickContractual: {
        outpatient: contractualSick,
        hospitalisation: contractualHospitalisation
      },
      sickAssessment,
      note: "Statutory minimums are a floor. Contractual benefits can be more favourable."
    },
    steps: [
      {
        label: "Completed service months",
        result: String(serviceMonths)
      },
      {
        label: "Annual leave statutory context",
        expression: "7 days in year 1, +1 day per completed year, capped at 14",
        result: `${annualStatutory} days`
      },
      {
        label: "Paid sick leave context",
        expression: "After 6 months: 14 outpatient / 60 hospitalisation days",
        result: `${sickOutpatient} / ${sickHospitalisation} days`
      }
    ],
    ruleVersionId: meta.ruleVersionId,
    sourceVersionIds: meta.sourceVersionIds,
    effectiveDate: meta.effectiveDate,
    applicability: { status: "APPLIES", reasons: [] },
    warnings: [
      "Leave comparisons are context, not a legal conclusion. Different rules can apply to probation and partial years."
    ]
  };
}
