export type PageArtefact = {
  pageNumber: number;
  text: string;
  imageObjectKey?: string;
  sha256: string;
};

export type ProposedFieldStatus = "PRESENT" | "ABSENT" | "UNREADABLE" | "UNCERTAIN";

export type ProposedField = {
  fieldKey: string;
  value: unknown;
  status: ProposedFieldStatus;
  confidence: number | null;
  pageNumber?: number;
  sourceSpan?: string;
};

export type ProposedFieldSet = {
  schemaVersion: string;
  provider: { name: string; model?: string; promptTemplateHash?: string };
  fields: ProposedField[];
  redaction: { nricCount: number; accountCount: number };
};

export interface ExtractionProvider {
  extract(pages: PageArtefact[], fieldKeys: string[]): Promise<ProposedFieldSet>;
}

export const EXTRACTION_SCHEMA_VERSION = "employment-v1";
export const PROMPT_TEMPLATE_HASH = "deterministic-local-1";

export const EXTRACTABLE_FIELD_KEYS = [
  "documentKind",
  "employeeResidency",
  "prStatusEffectiveDate",
  "cpfContributionArrangement",
  "dateOfBirth",
  "basicMonthlySalary",
  "employer.legalName",
  "employeeName",
  "jobTitle",
  "duties",
  "startDate",
  "employmentDuration",
  "workingHoursPerDay",
  "workingDaysPerWeek",
  "restDay",
  "salaryPeriod",
  "leave.annual",
  "leave.sick",
  "leave.hospitalisation",
  "medicalBenefits",
  "probation",
  "noticePeriod",
  "placeOfWork",
  "overtime.period",
  "overtime.rate"
] as const;
