import type { EvidenceCategory } from "./evidence";
import type { ConfirmedEmploymentFactsV1 } from "./facts/employment-v1";
import type { Money } from "./money";

export type ReportValue = {
  label: string;
  value: string;
  category: EvidenceCategory | "CONFIRMED_FACT" | "USER_ENTRY" | "INTERPRETATION";
  formula?: string;
  effectiveDate?: string;
  warning?: string;
  evidenceKey?: string;
};

export type ReportSection = {
  key: string;
  title: string;
  summary: string;
  values: ReportValue[];
  items?: Array<{
    key: string;
    label: string;
    status: string;
    detail: string;
    action?: string;
    evidenceKey?: string;
  }>;
  warnings: string[];
};

export type SourceReference = {
  label: string;
  url: string;
  effectiveDate: string;
  snapshotChecksum: string;
  ruleVersion?: string;
  limitations?: string;
};

export type ReportRenderModel = {
  version: 1;
  reportId: string;
  reportVersion: number;
  generatedAt: string;
  documentKind: "OFFER" | "CONTRACT";
  partialCoverage: boolean;
  staleDependencies: string[];
  factsSummary: {
    employer: string;
    employeeName: string;
    jobTitle: string;
    startDate: string;
    basicMonthlySalary: Money;
    residency: string;
    compensationPeriod: string;
  };
  sections: ReportSection[];
  questions: Array<{ id: string; text: string; reason: string; evidenceKey?: string }>;
  sources: SourceReference[];
  disclaimers: string[];
  confirmedFacts: ConfirmedEmploymentFactsV1;
};

export type ReportListItem = {
  id: string;
  documentId: string;
  documentKind: "OFFER" | "CONTRACT";
  createdAt: string;
  status: string;
  version: number;
  supersededAt: string | null;
};
