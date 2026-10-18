import { z } from "zod";
import { createHash } from "node:crypto";

export const MoneySchema = z
  .object({
    currency: z.literal("SGD"),
    cents: z.number().int().min(0).max(1_000_000_000)
  })
  .strict();

export const ProvenanceSchema = z
  .object({
    origin: z.enum(["DOCUMENT", "USER"]),
    extractionRevisionId: z.string().uuid().optional(),
    page: z.number().int().min(1).max(500).optional(),
    sourceSpanId: z.string().min(1).max(200).optional()
  })
  .strict();

export const CompensationComponentSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9_.-]+$/),
    label: z.string().min(1).max(160),
    amount: MoneySchema,
    cadence: z.enum(["MONTHLY", "ANNUAL", "ONE_OFF", "FORMULA"]),
    guarantee: z.enum(["GUARANTEED", "DISCRETIONARY", "INDETERMINATE"]),
    direction: z.enum(["EARNING", "DEDUCTION"]),
    cpfWageClass: z.enum(["ORDINARY_WAGE", "ADDITIONAL_WAGE", "EXCLUDED", "NEEDS_REVIEW"]),
    formulaText: z.string().max(500).optional()
  })
  .strict();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "Use a real calendar date");

export const EmploymentDurationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PERMANENT") }).strict(),
  z.object({ kind: z.literal("FIXED_TERM"), endDate: isoDate }).strict()
]);

export const ConfirmedEmploymentFactsV1Schema = z
  .object({
    documentKind: z.enum(["OFFER", "CONTRACT"]),
    employeeResidency: z.enum(["CITIZEN", "PR"]),
    prStatusEffectiveDate: isoDate.optional(),
    cpfContributionArrangement: z.enum([
      "FULL_STANDARD",
      "GRADUATED_STANDARD",
      "FULL_EMPLOYER_GRADUATED_EMPLOYEE",
      "FULL_EMPLOYER_FULL_EMPLOYEE",
      "UNKNOWN"
    ]),
    dateOfBirth: isoDate,
    compensationPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
    basicMonthlySalary: MoneySchema,
    compensationComponents: z.array(CompensationComponentSchema).max(40),
    employer: z.object({ legalName: z.string().min(1).max(200) }).strict(),
    employeeName: z.string().min(1).max(200),
    jobTitle: z.string().min(1).max(200),
    duties: z.array(z.string().min(1).max(500)).min(1).max(40),
    employmentActRoleClassification: z.enum([
      "WORKMAN",
      "NON_WORKMAN",
      "MANAGER_EXECUTIVE",
      "UNKNOWN"
    ]),
    industryDescription: z.string().max(300).optional(),
    startDate: isoDate,
    employmentDuration: EmploymentDurationSchema,
    workingHoursPerDay: z
      .string()
      .regex(/^\d{1,2}(\.\d{1,2})?$/)
      .optional(),
    workingDaysPerWeek: z
      .string()
      .regex(/^\d{1,2}(\.\d{1,2})?$/)
      .optional(),
    restDay: z.string().max(60).optional(),
    salaryPeriod: z.string().max(60).optional(),
    overtime: z
      .object({ period: z.string().max(80).optional(), rate: z.string().max(80).optional() })
      .strict()
      .optional(),
    leave: z
      .object({
        annual: z.string().max(80).optional(),
        sick: z.string().max(80).optional(),
        hospitalisation: z.string().max(80).optional()
      })
      .strict()
      .optional(),
    medicalBenefits: z.string().max(300).optional(),
    probation: z.string().max(120).optional(),
    noticePeriod: z.string().max(120).optional(),
    placeOfWork: z.string().max(300).optional(),
    provenance: z.record(z.string(), ProvenanceSchema)
  })
  .strict()
  .refine(
    (facts) =>
      new Set(facts.compensationComponents.map((component) => component.key)).size ===
      facts.compensationComponents.length,
    { message: "Compensation component keys must be unique.", path: ["compensationComponents"] }
  );

export type ConfirmedEmploymentFactsV1 = z.infer<typeof ConfirmedEmploymentFactsV1Schema>;
export type CompensationComponent = z.infer<typeof CompensationComponentSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const CORE_CRITICAL_FIELDS = [
  "documentKind",
  "employeeResidency",
  "cpfContributionArrangement",
  "dateOfBirth",
  "compensationPeriod",
  "basicMonthlySalary",
  "employer.legalName",
  "employeeName",
  "jobTitle",
  "duties",
  "employmentActRoleClassification",
  "startDate",
  "employmentDuration",
  "compensationComponents"
] as const;

/** Optional critical fields may be confirmed absent, which yields UNAVAILABLE dependent evidence. */
export const OPTIONAL_CRITICAL_FIELDS = ["workingHoursPerDay", "workingDaysPerWeek"] as const;

export type ConfirmationAction = "ACCEPT" | "EDIT" | "CONFIRM_ABSENT";
export type ConfirmationManifestEntry = {
  key: string;
  action: ConfirmationAction;
  valueHash: string;
};
export type ConfirmationManifest = {
  extractionRevisionId?: string;
  fields: ConfirmationManifestEntry[];
};

export function criticalFieldKeys(facts: ConfirmedEmploymentFactsV1): string[] {
  const keys: string[] = [...CORE_CRITICAL_FIELDS, ...OPTIONAL_CRITICAL_FIELDS];
  if (facts.employeeResidency === "PR") keys.push("prStatusEffectiveDate");
  if (facts.employmentDuration.kind === "FIXED_TERM") keys.push("employmentDuration.endDate");
  for (const component of facts.compensationComponents) {
    keys.push(`compensationComponents.${component.key}.cpfWageClass`);
    keys.push(`compensationComponents.${component.key}.guarantee`);
  }
  return keys;
}

export function getFieldValue(facts: ConfirmedEmploymentFactsV1, key: string): unknown {
  if (key.startsWith("compensationComponents.")) {
    const [, componentKey, property] = key.split(".");
    const component = facts.compensationComponents.find((item) => item.key === componentKey);
    if (!component || !property) return undefined;
    return component[property as "cpfWageClass" | "guarantee"];
  }
  if (key === "employer.legalName") return facts.employer.legalName;
  if (key === "employmentDuration.endDate")
    return facts.employmentDuration.kind === "FIXED_TERM"
      ? facts.employmentDuration.endDate
      : undefined;
  return (facts as Record<string, unknown>)[key];
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

export function hashFieldValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function hashFacts(facts: ConfirmedEmploymentFactsV1): string {
  return createHash("sha256").update(stableStringify(facts)).digest("hex");
}

export type ConfirmationIssue = { field: string; message: string };

export function validateForConfirmation(
  facts: ConfirmedEmploymentFactsV1,
  manifest: ConfirmationManifest
): ConfirmationIssue[] {
  const issues: ConfirmationIssue[] = [];
  const parsed = ConfirmedEmploymentFactsV1Schema.safeParse(facts);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ field: issue.path.join(".") || "facts", message: issue.message });
    }
    return issues;
  }

  if (facts.employeeResidency === "PR" && !facts.prStatusEffectiveDate) {
    issues.push({ field: "prStatusEffectiveDate", message: "PRs must confirm the PR start date." });
  }
  if (facts.startDate < facts.compensationPeriod + "-01") {
    // Offers may start after the reporting month; starting before it is allowed only
    // when the user is checking an already-started contract.
  }
  if (
    facts.employmentDuration.kind === "FIXED_TERM" &&
    facts.employmentDuration.endDate < facts.startDate
  ) {
    issues.push({
      field: "employmentDuration.endDate",
      message: "End date cannot precede the start date."
    });
  }
  if (new Date(`${facts.dateOfBirth}T00:00:00Z`).valueOf() >= Date.now()) {
    issues.push({ field: "dateOfBirth", message: "Date of birth must be in the past." });
  }

  for (const component of facts.compensationComponents) {
    if (component.direction === "DEDUCTION" && component.amount.cents === 0) {
      issues.push({
        field: `compensationComponents.${component.key}.amount`,
        message: "A deduction must have a positive amount."
      });
    }
    if (component.cpfWageClass === "NEEDS_REVIEW") {
      issues.push({
        field: `compensationComponents.${component.key}.cpfWageClass`,
        message: "Classify this component for CPF before confirming."
      });
    }
    if (component.guarantee === "INDETERMINATE") {
      // Indeterminate components are allowed, but never enter guaranteed totals.
      continue;
    }
  }

  const manifestKeys = new Map(manifest.fields.map((entry) => [entry.key, entry]));
  for (const key of criticalFieldKeys(facts)) {
    const entry = manifestKeys.get(key);
    if (!entry) {
      issues.push({ field: key, message: "Confirm this field explicitly." });
      continue;
    }
    const value = getFieldValue(facts, key);
    if (entry.action === "CONFIRM_ABSENT") {
      if (!(OPTIONAL_CRITICAL_FIELDS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: "This field is required for a report." });
      }
      if (value !== undefined && value !== null && value !== "") {
        issues.push({ field: key, message: "This field has a value; use accept or edit." });
      }
      continue;
    }
    if (value === undefined || value === null || value === "") {
      issues.push({ field: key, message: "This field is required for a report." });
      continue;
    }
    if (entry.valueHash !== hashFieldValue(value)) {
      issues.push({ field: key, message: "The confirmation is stale. Review the current value." });
    }
  }

  for (const entry of manifest.fields) {
    if (!criticalFieldKeys(facts).includes(entry.key)) {
      issues.push({ field: entry.key, message: "Unknown confirmation field." });
    }
  }

  return issues;
}

export const FIELD_REGISTRY: Record<
  string,
  { label: string; description: string; critical: boolean }
> = {
  documentKind: {
    label: "Document type",
    description: "Offer letter or employment contract.",
    critical: true
  },
  employeeResidency: {
    label: "Residency",
    description: "Singapore Citizen or Permanent Resident.",
    critical: true
  },
  prStatusEffectiveDate: {
    label: "PR start date",
    description: "The date PR status began; affects CPF year and rates.",
    critical: true
  },
  cpfContributionArrangement: {
    label: "CPF arrangement",
    description: "Standard rates, or a first/second-year PR arrangement.",
    critical: true
  },
  dateOfBirth: { label: "Date of birth", description: "Used for CPF age bands.", critical: true },
  compensationPeriod: {
    label: "Salary period",
    description: "The month the salary figures describe.",
    critical: true
  },
  basicMonthlySalary: {
    label: "Basic monthly salary",
    description: "Gross basic pay in SGD.",
    critical: true
  },
  "employer.legalName": { label: "Employer", description: "Legal employer name.", critical: true },
  employeeName: { label: "Employee", description: "Full name on the document.", critical: true },
  jobTitle: { label: "Job title", description: "Stated title.", critical: true },
  duties: { label: "Duties", description: "Main duties and responsibilities.", critical: true },
  employmentActRoleClassification: {
    label: "Employment Act role",
    description: "Workman, non-workman, or manager/executive. Title alone is not enough.",
    critical: true
  },
  startDate: { label: "Start date", description: "Employment start date.", critical: true },
  employmentDuration: {
    label: "Duration",
    description: "Permanent or fixed term.",
    critical: true
  },
  workingHoursPerDay: {
    label: "Hours per day",
    description: "Contractual hours, excluding breaks.",
    critical: false
  },
  workingDaysPerWeek: {
    label: "Days per week",
    description: "Contractual working days.",
    critical: false
  }
};
