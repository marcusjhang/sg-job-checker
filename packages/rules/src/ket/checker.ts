import type { ConfirmedEmploymentFactsV1, Evidence } from "@job-checker/contracts";

export type KetStatus = "PRESENT" | "MISSING" | "INDETERMINATE" | "NOT_APPLICABLE" | "UNAVAILABLE";

export type KetCheck = {
  itemNumber: number;
  item: string;
  status: KetStatus;
  required: boolean;
  detail: string;
  action?: string;
};

export type KetMeta = {
  ruleVersionId: string;
  sourceVersionIds: string[];
  effectiveDate: string;
  sourceUrl: string;
};

function check(
  itemNumber: number,
  item: string,
  status: KetStatus,
  required: boolean,
  detail: string,
  action?: string
): KetCheck {
  const result: KetCheck = { itemNumber, item, status, required, detail };
  if (action) result.action = action;
  return result;
}

export function assessKet(facts: ConfirmedEmploymentFactsV1, meta: KetMeta): Evidence<KetCheck>[] {
  const checks: KetCheck[] = [];
  const has = (value: string | undefined): boolean => Boolean(value && value.trim().length > 0);

  checks.push(check(1, "Full name of employer", "PRESENT", true, facts.employer.legalName));
  checks.push(check(2, "Full name of employee", "PRESENT", true, facts.employeeName));
  checks.push(
    check(
      3,
      "Job title, duties and responsibilities",
      "PRESENT",
      true,
      `${facts.jobTitle}; ${facts.duties.length} duty item(s) confirmed`
    )
  );
  checks.push(check(4, "Start date", "PRESENT", true, facts.startDate));

  if (facts.employmentDuration.kind === "FIXED_TERM") {
    checks.push(
      check(
        5,
        "Duration of employment",
        "PRESENT",
        true,
        `Fixed term ending ${facts.employmentDuration.endDate}`
      )
    );
  } else {
    checks.push(
      check(
        5,
        "Duration of employment",
        "NOT_APPLICABLE",
        false,
        "Permanent role; end date is not applicable."
      )
    );
  }

  const arrangementMissing = [
    !has(facts.workingHoursPerDay) ? "daily hours" : null,
    !has(facts.workingDaysPerWeek) ? "working days per week" : null,
    !has(facts.restDay) ? "rest day" : null
  ].filter((value): value is string => value !== null);

  checks.push(
    arrangementMissing.length === 0
      ? check(
          6,
          "Working arrangements",
          "PRESENT",
          true,
          `${facts.workingHoursPerDay} hours/day; ${facts.workingDaysPerWeek} days/week; rest day ${facts.restDay}`
        )
      : check(
          6,
          "Working arrangements",
          "MISSING",
          true,
          `Not stated: ${arrangementMissing.join(", ")}.`,
          "Ask HR to confirm daily hours, working days per week, and the rest day."
        )
  );

  checks.push(
    has(facts.salaryPeriod)
      ? check(7, "Salary period", "PRESENT", true, facts.salaryPeriod ?? "")
      : check(
          7,
          "Salary period",
          "MISSING",
          true,
          "The salary period (for example, monthly) is not stated.",
          "Ask HR to state the salary period."
        )
  );

  checks.push(
    check(
      8,
      "Basic salary",
      "PRESENT",
      true,
      `Basic monthly salary confirmed for ${facts.compensationPeriod}`
    )
  );

  const fixedAllowances = facts.compensationComponents.filter(
    (component) => component.direction === "EARNING" && component.cadence === "MONTHLY"
  );
  const fixedDeductions = facts.compensationComponents.filter(
    (component) => component.direction === "DEDUCTION" && component.cadence === "MONTHLY"
  );

  checks.push(
    fixedAllowances.length > 0
      ? check(
          9,
          "Fixed allowances",
          "PRESENT",
          true,
          fixedAllowances.map((item) => item.label).join(", ")
        )
      : check(
          9,
          "Fixed allowances",
          "MISSING",
          false,
          "No fixed allowances were confirmed. The contract should state whether any apply.",
          "Ask HR to state “none” if there are no fixed allowances."
        )
  );

  checks.push(
    fixedDeductions.length > 0
      ? check(
          10,
          "Fixed deductions",
          "PRESENT",
          true,
          fixedDeductions.map((item) => item.label).join(", ")
        )
      : check(
          10,
          "Fixed deductions",
          "MISSING",
          false,
          "No fixed deductions were confirmed. The contract should state whether any apply.",
          "Ask HR to state “none” if there are no fixed deductions."
        )
  );

  const overtimeRelevant = facts.employmentActRoleClassification !== "MANAGER_EXECUTIVE";
  const overtimeUnknown = facts.employmentActRoleClassification === "UNKNOWN";
  checks.push(
    !overtimeRelevant
      ? check(
          11,
          "Overtime payment period",
          "NOT_APPLICABLE",
          false,
          "Managers and executives are outside Part IV overtime."
        )
      : overtimeUnknown
        ? check(
            11,
            "Overtime payment period",
            "INDETERMINATE",
            true,
            "The Employment Act role is not confirmed, so overtime applicability is unknown.",
            "Confirm whether the role is a workman, non-workman, or manager/executive."
          )
        : has(facts.overtime?.period)
          ? check(11, "Overtime payment period", "PRESENT", true, facts.overtime?.period ?? "")
          : check(
              11,
              "Overtime payment period",
              "MISSING",
              true,
              "Overtime payment period is not stated.",
              "Ask HR to confirm the overtime payment period, if overtime applies."
            )
  );
  checks.push(
    !overtimeRelevant
      ? check(
          12,
          "Overtime rate of pay",
          "NOT_APPLICABLE",
          false,
          "Managers and executives are outside Part IV overtime."
        )
      : overtimeUnknown
        ? check(
            12,
            "Overtime rate of pay",
            "INDETERMINATE",
            true,
            "The Employment Act role is not confirmed, so overtime applicability is unknown.",
            "Confirm whether the role is a workman, non-workman, or manager/executive."
          )
        : has(facts.overtime?.rate)
          ? check(12, "Overtime rate of pay", "PRESENT", true, facts.overtime?.rate ?? "")
          : check(
              12,
              "Overtime rate of pay",
              "MISSING",
              true,
              "Overtime rate is not stated.",
              "Ask HR to confirm the overtime rate, if overtime applies."
            )
  );

  const otherComponents = facts.compensationComponents.filter(
    (component) => component.cadence !== "MONTHLY"
  );
  checks.push(
    otherComponents.length > 0
      ? check(
          13,
          "Other salary components",
          "PRESENT",
          true,
          otherComponents.map((item) => item.label).join(", ")
        )
      : check(
          13,
          "Other salary components",
          "NOT_APPLICABLE",
          false,
          "No bonuses or incentives were confirmed.",
          "If a bonus or incentive exists, ask HR to state it and whether it is guaranteed."
        )
  );

  const leaveMissing = [
    !has(facts.leave?.annual) ? "annual leave" : null,
    !has(facts.leave?.sick) ? "outpatient sick leave" : null,
    !has(facts.leave?.hospitalisation) ? "hospitalisation leave" : null
  ].filter((value): value is string => value !== null);
  checks.push(
    leaveMissing.length === 0
      ? check(
          14,
          "Type of leave",
          "PRESENT",
          true,
          "Annual, sick, and hospitalisation leave stated."
        )
      : check(
          14,
          "Type of leave",
          "MISSING",
          true,
          `Not stated: ${leaveMissing.join(", ")}.`,
          "Ask HR to confirm annual leave, outpatient sick leave, and hospitalisation leave."
        )
  );

  checks.push(
    has(facts.medicalBenefits)
      ? check(15, "Other medical benefits", "PRESENT", true, facts.medicalBenefits ?? "")
      : check(
          15,
          "Other medical benefits",
          "MISSING",
          true,
          "Medical benefits (for example insurance, outpatient, dental) are not stated.",
          "Ask HR to confirm medical benefits, or state “none”."
        )
  );

  checks.push(
    has(facts.probation)
      ? check(16, "Probation period", "PRESENT", true, facts.probation ?? "")
      : check(
          16,
          "Probation period",
          "MISSING",
          true,
          "Probation period is not stated.",
          "Ask HR to confirm the probation period, or state “none”."
        )
  );

  checks.push(
    has(facts.noticePeriod)
      ? check(17, "Notice period", "PRESENT", true, facts.noticePeriod ?? "")
      : check(
          17,
          "Notice period",
          "MISSING",
          true,
          "Notice period is not stated.",
          "Ask HR to confirm the notice period."
        )
  );

  checks.push(
    has(facts.placeOfWork)
      ? check(18, "Place of work", "PRESENT", false, facts.placeOfWork ?? "")
      : check(
          18,
          "Place of work",
          "NOT_APPLICABLE",
          false,
          "Optional item; employer address applies by default."
        )
  );

  return checks.map((entry) => ({
    key: `ket.item.${entry.itemNumber}`,
    category: "KET" as const,
    title: `KET ${entry.itemNumber}: ${entry.item}`,
    inputs: { itemNumber: entry.itemNumber, required: entry.required },
    output: entry,
    steps: [
      {
        label: "Check presence in confirmed facts",
        result: entry.status
      }
    ],
    ruleVersionId: meta.ruleVersionId,
    sourceVersionIds: meta.sourceVersionIds,
    effectiveDate: meta.effectiveDate,
    applicability:
      entry.status === "NOT_APPLICABLE"
        ? { status: "DOES_NOT_APPLY", reasons: [entry.detail] }
        : entry.status === "UNAVAILABLE"
          ? { status: "UNAVAILABLE", reasons: [entry.detail] }
          : entry.status === "INDETERMINATE"
            ? { status: "INDETERMINATE", reasons: [entry.detail] }
            : { status: "APPLIES", reasons: [] },
    warnings:
      entry.status === "MISSING"
        ? [
            "A missing KET item is not automatically unlawful. Clarify with the employer or seek advice."
          ]
        : []
  }));
}
