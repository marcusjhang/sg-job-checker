import type {
  ConfirmedEmploymentFactsV1,
  Evidence,
  ReportRenderModel,
  ReportSection,
  ReportValue,
  SourceReference
} from "@job-checker/contracts";
import { formatCents } from "@job-checker/contracts";
import type { CompensationResult } from "@job-checker/rules";
import type { CpfResult } from "@job-checker/rules";
import type { KetCheck } from "@job-checker/rules";
import type {
  EaCoverageResult,
  EaLeaveResult,
  EaOvertimeResult,
  EaRateResult
} from "@job-checker/rules";
import type { WageLookup } from "@job-checker/benchmarks";

export type EvidenceRowLike = {
  key: string;
  category: string;
  output: unknown;
  steps: unknown;
  applicability: unknown;
  warnings: unknown;
  effectiveDate: string;
  ruleVersionId?: string | null;
};

function warningList(evidence: EvidenceRowLike | undefined): string[] {
  return Array.isArray(evidence?.warnings) ? (evidence.warnings as string[]) : [];
}

export function buildRenderModel(input: {
  reportId: string;
  reportVersion: number;
  generatedAt: string;
  facts: ConfirmedEmploymentFactsV1;
  evidence: EvidenceRowLike[];
  sources: SourceReference[];
  partialCoverage: boolean;
  staleDependencies: string[];
  benchmarkDemo: boolean;
}): ReportRenderModel {
  const { facts } = input;
  const byKey = new Map(input.evidence.map((evidence) => [evidence.key, evidence]));
  const compensation = byKey.get("compensation.guaranteed")?.output as
    CompensationResult | undefined;
  const cpf = byKey.get("cpf.contribution")?.output as CpfResult | undefined;
  const benchmark = byKey.get("benchmark.occupation")?.output as WageLookup | undefined;
  const coverage = byKey.get("employment-act.coverage")?.output as EaCoverageResult | undefined;
  const rate = byKey.get("employment-act.rate-of-pay")?.output as EaRateResult | undefined;
  const overtime = byKey.get("employment-act.overtime")?.output as EaOvertimeResult | undefined;
  const leave = byKey.get("employment-act.leave")?.output as EaLeaveResult | undefined;

  const questions: ReportReportQuestions = [];
  const addQuestion = (text: string, reason: string, evidenceKey?: string) => {
    if (questions.some((question) => question.text === text)) return;
    const question: ReportReportQuestions[number] = {
      id: `q${questions.length + 1}`,
      text,
      reason
    };
    if (evidenceKey) question.evidenceKey = evidenceKey;
    questions.push(question);
  };

  const scopeWarnings = [
    "This is a structured second opinion, not legal, tax, or financial advice.",
    "Foreign-worker levies, work-pass eligibility, shift schedules, equity, commission-dominant roles, tax, non-compete enforceability, and outcome prediction are out of scope.",
    ...input.staleDependencies.map(
      (item) => `A dependency changed: ${item}. This report is superseded.`
    )
  ];

  const sections: ReportSection[] = [];

  sections.push({
    key: "facts",
    title: "Confirmed facts",
    summary: "Facts you explicitly confirmed. Every calculation below uses these values only.",
    values: [
      value("Employer", facts.employer.legalName, "CONFIRMED_FACT"),
      value("Employee", facts.employeeName, "CONFIRMED_FACT"),
      value("Role", facts.jobTitle, "CONFIRMED_FACT"),
      value("Residency", facts.employeeResidency, "CONFIRMED_FACT"),
      value("Start date", facts.startDate, "CONFIRMED_FACT"),
      value(
        "Duration",
        facts.employmentDuration.kind === "PERMANENT"
          ? "Permanent"
          : `Fixed term to ${facts.employmentDuration.endDate}`,
        "CONFIRMED_FACT"
      ),
      value("Basic monthly salary", formatCents(facts.basicMonthlySalary.cents), "CONFIRMED_FACT"),
      value("Compensation period", facts.compensationPeriod, "CONFIRMED_FACT")
    ],
    warnings: []
  });

  const compensationValues: ReportValue[] = [];
  if (compensation) {
    compensationValues.push(
      value(
        "Monthly contractual cash (before employee CPF)",
        formatCents(compensation.monthlyContractualCashCents),
        "COMPENSATION",
        undefined,
        "compensation.guaranteed"
      ),
      value(
        "Monthly fixed deductions",
        formatCents(compensation.monthlyFixedDeductionsCents),
        "COMPENSATION",
        undefined,
        "compensation.guaranteed"
      ),
      value(
        "Estimated monthly take-home",
        compensation.monthlyTakeHomeCents === null
          ? "Unavailable"
          : formatCents(compensation.monthlyTakeHomeCents),
        "COMPENSATION",
        "Excludes personal income tax and out-of-scope deductions.",
        "compensation.guaranteed"
      ),
      value(
        "Annual guaranteed cash",
        formatCents(compensation.annualGuaranteedCashCents),
        "COMPENSATION",
        undefined,
        "compensation.guaranteed"
      ),
      value(
        "Employer CPF (separate from cash)",
        compensation.employerCpfCents === null
          ? "Unavailable"
          : formatCents(compensation.employerCpfCents),
        "COMPENSATION",
        "Employer CPF is not cash take-home.",
        "compensation.guaranteed"
      )
    );
    for (const excluded of compensation.excludedComponents) {
      compensationValues.push(
        value(
          `${excluded.label} (excluded)`,
          formatCents(excluded.cents),
          "INTERPRETATION",
          excluded.reason,
          "compensation.guaranteed"
        )
      );
    }
    for (const clarification of compensation.clarifications) {
      addQuestion(
        clarification,
        "Guaranteed totals exclude unresolved components.",
        "compensation.guaranteed"
      );
    }
  } else {
    compensationValues.push(
      value("Compensation", "Unavailable", "COMPENSATION", "Rule unavailable.")
    );
  }
  sections.push({
    key: "compensation",
    title: "Compensation",
    summary:
      "Guaranteed cash only. Discretionary and indeterminate components are excluded, never invented.",
    values: compensationValues,
    warnings: warningList(byKey.get("compensation.guaranteed"))
  });

  const cpfValues: ReportValue[] = [];
  if (cpf) {
    cpfValues.push(
      value(
        "Employee CPF",
        formatCents(cpf.employeeContributionCents),
        "CPF",
        undefined,
        "cpf.contribution"
      ),
      value(
        "Employer CPF",
        formatCents(cpf.employerContributionCents),
        "CPF",
        undefined,
        "cpf.contribution"
      ),
      value(
        "Total CPF",
        formatCents(cpf.totalContributionCents),
        "CPF",
        undefined,
        "cpf.contribution"
      ),
      value(
        "Wages subject to CPF",
        formatCents(cpf.totalWagesSubjectCents),
        "CPF",
        `OW ceiling ${formatCents(cpf.owCeilingCents)}.`,
        "cpf.contribution"
      ),
      value("CPF age band", cpf.ageBandLabel, "CPF", undefined, "cpf.contribution"),
      value(
        "Additional Wage ceiling remaining",
        formatCents(cpf.awRoomCents),
        "CPF",
        undefined,
        "cpf.contribution"
      )
    );
  } else {
    const cpfEvidence = byKey.get("cpf.contribution");
    cpfValues.push(
      value(
        "CPF",
        "Unavailable",
        "CPF",
        warningList(cpfEvidence)[0] ?? "CPF could not be calculated from the confirmed facts.",
        "cpf.contribution"
      )
    );
  }
  sections.push({
    key: "cpf",
    title: "CPF",
    summary:
      "Effective-dated CPF rules applied to confirmed wages. Employer CPF is separate from take-home.",
    values: cpfValues,
    warnings: warningList(byKey.get("cpf.contribution"))
  });

  const benchmarkValues: ReportValue[] = [];
  if (benchmark?.available) {
    benchmarkValues.push(
      value(
        "Occupation",
        benchmark.title,
        "BENCHMARK",
        `${benchmark.datasetKey} ${benchmark.version}; ${benchmark.wageBasis}`,
        "benchmark.occupation"
      ),
      value(
        "25th percentile",
        benchmark.p25Cents === null ? "Not published" : formatCents(benchmark.p25Cents),
        "BENCHMARK",
        `Effective ${benchmark.effectiveDate}`,
        "benchmark.occupation"
      ),
      value(
        "Median",
        benchmark.medianCents === null ? "Not published" : formatCents(benchmark.medianCents),
        "BENCHMARK",
        `Effective ${benchmark.effectiveDate}`,
        "benchmark.occupation"
      ),
      value(
        "75th percentile",
        benchmark.p75Cents === null ? "Not published" : formatCents(benchmark.p75Cents),
        "BENCHMARK",
        `Effective ${benchmark.effectiveDate}`,
        "benchmark.occupation"
      )
    );
  } else {
    benchmarkValues.push(
      value(
        "Benchmark",
        "Unavailable",
        "BENCHMARK",
        benchmark && !benchmark.available
          ? benchmark.reason
          : "Select an occupation or continue without a benchmark.",
        "benchmark.occupation"
      )
    );
    addQuestion(
      "Which occupation best matches your duties?",
      "A benchmark is only shown after you confirm an occupation.",
      "benchmark.occupation"
    );
  }
  sections.push({
    key: "benchmark",
    title: "Official wage context",
    summary: input.benchmarkDemo
      ? "DEMONSTRATION DATA. This is not official MOM statistics and must not be used for a real pay decision."
      : "Official wage context with source date, basis, coverage, and limitations.",
    values: benchmarkValues,
    warnings: benchmark?.available ? [benchmark.limitations] : []
  });

  const ketEvidence = input.evidence.filter((item) => item.key.startsWith("ket.item."));
  const ketItems = ketEvidence.map((item) => {
    const check = item.output as KetCheck;
    const entry: NonNullable<ReportSection["items"]>[number] = {
      key: item.key,
      label: `${check.itemNumber}. ${check.item}`,
      status: check.status,
      detail: check.detail,
      evidenceKey: item.key
    };
    if (check.action) entry.action = check.action;
    if (check.status === "MISSING" && check.action) {
      addQuestion(check.action, "A key employment term is not stated.", item.key);
    }
    return entry;
  });
  sections.push({
    key: "ket",
    title: "Key Employment Terms",
    summary:
      "Presence and applicability, not a legal conclusion. Missing items are clarified with HR.",
    values: [],
    items: ketItems,
    warnings: [
      "A missing KET item is never automatically called unlawful. Clarify with the employer or seek advice."
    ]
  });

  const eaValues: ReportValue[] = [];
  if (coverage) {
    eaValues.push(
      value(
        "Part IV coverage",
        coverage.covered,
        "EMPLOYMENT_ACT",
        coverage.reason,
        "employment-act.coverage"
      )
    );
  }
  if (rate) {
    eaValues.push(
      value(
        "Hourly basic rate",
        `S$${rate.hourlyRateExact}`,
        "EMPLOYMENT_ACT",
        rate.formula,
        "employment-act.rate-of-pay"
      ),
      value(
        "Daily basic rate",
        rate.dailyRateCents === null ? "Unavailable" : formatCents(rate.dailyRateCents),
        "EMPLOYMENT_ACT",
        "Based on confirmed contractual hours.",
        "employment-act.rate-of-pay"
      )
    );
  }
  if (overtime) {
    eaValues.push(
      value(
        "Overtime context",
        overtime.applies,
        "EMPLOYMENT_ACT",
        overtime.statedRateAssessment,
        "employment-act.overtime"
      )
    );
    if (overtime.minimumOvertimeRateCents !== null) {
      eaValues.push(
        value(
          "Minimum overtime rate context",
          `${formatCents(overtime.minimumOvertimeRateCents)} per hour`,
          "EMPLOYMENT_ACT",
          "1.5 × hourly basic rate.",
          "employment-act.overtime"
        )
      );
    }
  }
  if (leave) {
    eaValues.push(
      value(
        "Annual leave statutory context",
        `${leave.annualStatutoryDays} days`,
        "EMPLOYMENT_ACT",
        leave.annualAssessment,
        "employment-act.leave"
      ),
      value(
        "Paid sick leave context",
        `${leave.sickOutpatientDays} outpatient / ${leave.sickHospitalisationDays} hospitalisation days`,
        "EMPLOYMENT_ACT",
        leave.sickAssessment,
        "employment-act.leave"
      )
    );
  }
  sections.push({
    key: "employment-act",
    title: "Employment Act context",
    summary: "Scoped rate and entitlement context. Contractual terms can be more favourable.",
    values: eaValues,
    warnings: [
      ...warningList(byKey.get("employment-act.overtime")),
      ...warningList(byKey.get("employment-act.leave"))
    ]
  });

  for (const warning of cpfValues
    .map((item) => item.warning)
    .filter((item): item is string => Boolean(item))) {
    if (warning.toLowerCase().includes("year-to-date")) {
      addQuestion(
        "What are your year-to-date Ordinary and Additional Wages with this employer?",
        "Annual bonus CPF depends on the Additional Wage ceiling.",
        "cpf.contribution"
      );
    }
  }

  return {
    version: 1,
    reportId: input.reportId,
    reportVersion: input.reportVersion,
    generatedAt: input.generatedAt,
    documentKind: facts.documentKind,
    partialCoverage: input.partialCoverage,
    staleDependencies: input.staleDependencies,
    factsSummary: {
      employer: facts.employer.legalName,
      employeeName: facts.employeeName,
      jobTitle: facts.jobTitle,
      startDate: facts.startDate,
      basicMonthlySalary: facts.basicMonthlySalary,
      residency: facts.employeeResidency,
      compensationPeriod: facts.compensationPeriod
    },
    sections,
    questions,
    sources: input.sources,
    disclaimers: scopeWarnings,
    confirmedFacts: facts
  };
}

type ReportReportQuestions = ReportRenderModel["questions"];

function value(
  label: string,
  text: string,
  category: ReportValue["category"],
  warning?: string,
  evidenceKey?: string
): ReportValue {
  const result: ReportValue = { label, value: text, category };
  if (warning) result.warning = warning;
  if (evidenceKey) result.evidenceKey = evidenceKey;
  return result;
}

export function evidenceToRows(
  evidence: Array<Evidence<unknown> & { ruleVersionId?: string; benchmarkSnapshotId?: string }>
): EvidenceRowLike[] {
  return evidence.map((item) => ({
    key: item.key,
    category: item.category,
    output: item.output,
    steps: item.steps,
    applicability: item.applicability,
    warnings: item.warnings,
    effectiveDate: item.effectiveDate,
    ruleVersionId: item.ruleVersionId ?? null
  }));
}

export function assertEvidenceCategories(evidence: EvidenceRowLike[]): void {
  const allowed = new Set([
    "COMPENSATION",
    "CPF",
    "KET",
    "EMPLOYMENT_ACT",
    "BENCHMARK",
    "OBSERVATION"
  ]);
  for (const item of evidence) {
    if (!allowed.has(item.category)) throw new Error(`Invalid evidence category ${item.category}`);
  }
}
