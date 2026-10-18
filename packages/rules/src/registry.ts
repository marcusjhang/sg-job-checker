import { createHash } from "node:crypto";

export type RuleRow = {
  id: string;
  rule_key: string;
  semantic_version: string;
  effective_from: string;
  effective_to: string | null;
  review_state: string;
  fixture: unknown;
  implementation_sha256: string;
};

/**
 * Exact effective-date resolution. There is deliberately no “nearest” fallback.
 */
export function resolveRule(rows: RuleRow[], ruleKey: string, asOf: string): RuleRow | undefined {
  return rows.find(
    (row) =>
      row.rule_key === ruleKey &&
      row.review_state === "APPROVED" &&
      row.effective_from <= asOf &&
      (row.effective_to === null || asOf <= row.effective_to)
  );
}

export function hashImplementation(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
