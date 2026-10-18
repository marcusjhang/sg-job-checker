import type {
  ConfirmedEmploymentFactsV1,
  CompensationComponent,
  Evidence
} from "@job-checker/contracts";
import { formatCents } from "@job-checker/contracts";
import type { CpfInput, CpfResult } from "../cpf/types";

export type CompensationResult = {
  basicMonthlySalaryCents: number;
  monthlyOrdinaryEarningsCents: number;
  monthlyFixedDeductionsCents: number;
  monthlyContractualCashCents: number;
  monthlyTakeHomeCents: number | null;
  employeeCpfCents: number | null;
  employerCpfCents: number | null;
  annualGuaranteedCashCents: number;
  annualGuaranteedComponents: Array<{ label: string; cents: number; cadence: string }>;
  excludedComponents: Array<{ label: string; cents: number; reason: string }>;
  clarifications: string[];
  cpfOrdinaryWagesCents: number;
};

export function cpfInputFromFacts(facts: ConfirmedEmploymentFactsV1): CpfInput {
  const ordinary = facts.compensationComponents
    .filter(
      (component) =>
        component.direction === "EARNING" &&
        component.cadence === "MONTHLY" &&
        component.guarantee === "GUARANTEED" &&
        component.cpfWageClass === "ORDINARY_WAGE"
    )
    .reduce((total, component) => total + component.amount.cents, facts.basicMonthlySalary.cents);

  const input: CpfInput = {
    residency: facts.employeeResidency,
    arrangement: facts.cpfContributionArrangement,
    dateOfBirth: facts.dateOfBirth,
    wagePeriod: facts.compensationPeriod,
    ordinaryWagesCents: ordinary,
    additionalWagesCents: 0
  };
  if (facts.prStatusEffectiveDate) input.prStatusEffectiveDate = facts.prStatusEffectiveDate;
  return input;
}

function isGuaranteed(component: CompensationComponent): boolean {
  return component.guarantee === "GUARANTEED";
}

export function calculateCompensation(
  facts: ConfirmedEmploymentFactsV1,
  cpfEvidence: Evidence<CpfResult> | Evidence<null>,
  meta: { ruleVersionId: string; sourceVersionIds: string[]; effectiveDate: string }
): Evidence<CompensationResult> {
  const warnings: string[] = [];
  const clarifications: string[] = [];

  const monthlyEarnings = facts.compensationComponents.filter(
    (component) =>
      component.direction === "EARNING" &&
      component.cadence === "MONTHLY" &&
      isGuaranteed(component) &&
      component.cpfWageClass !== "EXCLUDED"
  );
  const monthlyOrdinaryEarnings =
    facts.basicMonthlySalary.cents +
    monthlyEarnings
      .filter((component) => component.cpfWageClass === "ORDINARY_WAGE")
      .reduce((total, component) => total + component.amount.cents, 0);

  const monthlyFixedDeductions = facts.compensationComponents
    .filter(
      (component) =>
        component.direction === "DEDUCTION" &&
        component.cadence === "MONTHLY" &&
        isGuaranteed(component)
    )
    .reduce((total, component) => total + component.amount.cents, 0);

  const monthlyContractualCash =
    facts.basicMonthlySalary.cents +
    monthlyEarnings.reduce((total, component) => total + component.amount.cents, 0);

  const annualComponents = facts.compensationComponents.filter(
    (component) =>
      component.direction === "EARNING" &&
      (component.cadence === "ANNUAL" || component.cadence === "ONE_OFF") &&
      isGuaranteed(component) &&
      component.cpfWageClass !== "EXCLUDED"
  );

  const annualGuaranteedComponents = [
    ...monthlyEarnings.map((component) => ({
      label: component.label,
      cents: component.amount.cents * 12,
      cadence: "MONTHLY × 12"
    })),
    {
      label: "Basic monthly salary × 12",
      cents: facts.basicMonthlySalary.cents * 12,
      cadence: "MONTHLY × 12"
    },
    ...annualComponents
      .filter((component) => component.cadence === "ANNUAL")
      .map((component) => ({
        label: component.label,
        cents: component.amount.cents,
        cadence: "ANNUAL"
      }))
  ];

  const annualGuaranteedCash = annualGuaranteedComponents.reduce(
    (total, component) => total + component.cents,
    0
  );

  const excludedComponents: CompensationResult["excludedComponents"] = [];
  for (const component of facts.compensationComponents) {
    if (component.direction === "DEDUCTION") continue;
    if (component.cadence === "FORMULA") {
      excludedComponents.push({
        label: component.label,
        cents: component.amount.cents,
        reason:
          "Formula-based component: excluded from guaranteed totals until the formula is resolved."
      });
      clarifications.push(
        `Resolve the formula for “${component.label}” before relying on guaranteed totals.`
      );
      continue;
    }
    if (component.cpfWageClass === "EXCLUDED" && component.direction === "EARNING") {
      excludedComponents.push({
        label: component.label,
        cents: component.amount.cents,
        reason:
          "Excluded from compensation totals (for example a reimbursement or non-wage benefit)."
      });
      continue;
    }
    if (component.guarantee === "DISCRETIONARY" || component.guarantee === "INDETERMINATE") {
      excludedComponents.push({
        label: component.label,
        cents: component.amount.cents,
        reason:
          component.guarantee === "DISCRETIONARY"
            ? "Discretionary: excluded from guaranteed totals."
            : "Guarantee not confirmed: excluded from guaranteed totals."
      });
      clarifications.push(
        `Is “${component.label}” contractual and guaranteed, or discretionary? It is excluded from guaranteed totals until clarified.`
      );
    } else if (component.cadence === "ONE_OFF") {
      excludedComponents.push({
        label: component.label,
        cents: component.amount.cents,
        reason: "One-off payment: not part of annual guaranteed cash."
      });
    } else if (component.cpfWageClass === "NEEDS_REVIEW") {
      clarifications.push(`Confirm the CPF wage class of “${component.label}”.`);
    }
  }

  const cpfOutput = cpfEvidence.output;
  let monthlyTakeHome: number | null = null;
  let employeeCpf: number | null = null;
  let employerCpf: number | null = null;
  if (cpfOutput) {
    employeeCpf = cpfOutput.employeeContributionCents;
    employerCpf = cpfOutput.employerContributionCents;
    monthlyTakeHome = monthlyContractualCash - monthlyFixedDeductions - employeeCpf;
    if (monthlyTakeHome < 0) {
      warnings.push(
        "Fixed deductions and employee CPF exceed monthly cash pay. Check the deduction amounts."
      );
    }
  } else {
    warnings.push("Take-home is unavailable because CPF could not be calculated.");
  }

  const result: CompensationResult = {
    basicMonthlySalaryCents: facts.basicMonthlySalary.cents,
    monthlyOrdinaryEarningsCents: monthlyOrdinaryEarnings,
    monthlyFixedDeductionsCents: monthlyFixedDeductions,
    monthlyContractualCashCents: monthlyContractualCash,
    monthlyTakeHomeCents: monthlyTakeHome,
    employeeCpfCents: employeeCpf,
    employerCpfCents: employerCpf,
    annualGuaranteedCashCents: annualGuaranteedCash,
    annualGuaranteedComponents,
    excludedComponents,
    clarifications: [...new Set(clarifications)],
    cpfOrdinaryWagesCents: monthlyOrdinaryEarnings
  };

  return {
    key: "compensation.guaranteed",
    category: "COMPENSATION",
    title: "Guaranteed compensation",
    inputs: {
      basicMonthlySalaryCents: facts.basicMonthlySalary.cents,
      components: facts.compensationComponents,
      compensationPeriod: facts.compensationPeriod
    },
    output: result,
    steps: [
      {
        label: "Monthly contractual cash before employee CPF",
        expression: facts.compensationComponents
          .filter(
            (component) =>
              component.direction === "EARNING" &&
              component.cadence === "MONTHLY" &&
              isGuaranteed(component)
          )
          .map((component) => `${component.label} ${formatCents(component.amount.cents)}`)
          .concat(`Basic ${formatCents(facts.basicMonthlySalary.cents)}`)
          .join(" + "),
        result: formatCents(monthlyContractualCash)
      },
      {
        label: "Monthly fixed deductions",
        expression: "Sum of confirmed guaranteed monthly deductions",
        result: formatCents(monthlyFixedDeductions)
      },
      {
        label: "Estimated monthly take-home",
        expression: `${formatCents(monthlyContractualCash)} − ${formatCents(
          monthlyFixedDeductions
        )} − employee CPF`,
        result: monthlyTakeHome === null ? "Unavailable" : formatCents(monthlyTakeHome)
      },
      {
        label: "Annual guaranteed cash",
        expression: "12 × guaranteed monthly earnings + guaranteed annual components",
        result: formatCents(annualGuaranteedCash)
      },
      {
        label: "Employer CPF (not cash take-home)",
        expression: "From CPF evidence",
        result: employerCpf === null ? "Unavailable" : formatCents(employerCpf)
      }
    ],
    ruleVersionId: meta.ruleVersionId,
    sourceVersionIds: meta.sourceVersionIds,
    effectiveDate: meta.effectiveDate,
    applicability: { status: "APPLIES", reasons: [] },
    warnings: [
      ...warnings,
      "Take-home excludes personal income tax and out-of-scope deductions. Employer CPF is not cash compensation."
    ]
  };
}
