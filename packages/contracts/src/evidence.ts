import { z } from "zod";

export const EvidenceCategorySchema = z.enum([
  "COMPENSATION",
  "CPF",
  "KET",
  "EMPLOYMENT_ACT",
  "BENCHMARK",
  "OBSERVATION"
]);

export type EvidenceCategory = z.infer<typeof EvidenceCategorySchema>;

export const ApplicabilitySchema = z
  .object({
    status: z.enum(["APPLIES", "DOES_NOT_APPLY", "INDETERMINATE", "UNAVAILABLE"]),
    reasons: z.array(z.string())
  })
  .strict();

export type Applicability = z.infer<typeof ApplicabilitySchema>;

export type EvidenceStep = { label: string; expression?: string; result: string };

export type Evidence<T> = {
  key: string;
  category: EvidenceCategory;
  title: string;
  inputs: Record<string, unknown>;
  output: T;
  steps: EvidenceStep[];
  ruleVersionId?: string;
  benchmarkSnapshotId?: string;
  sourceVersionIds: string[];
  effectiveDate: string;
  applicability: Applicability;
  warnings: string[];
};

export function unavailable(
  key: string,
  category: EvidenceCategory,
  title: string,
  reason: string,
  inputs: Record<string, unknown> = {}
): Evidence<null> {
  return {
    key,
    category,
    title,
    inputs,
    output: null,
    steps: [],
    sourceVersionIds: [],
    effectiveDate: new Date().toISOString().slice(0, 10),
    applicability: { status: "UNAVAILABLE", reasons: [reason] },
    warnings: [reason]
  };
}
