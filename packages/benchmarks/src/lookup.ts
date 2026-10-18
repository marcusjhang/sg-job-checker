export type BenchmarkSnapshotRow = {
  id: string;
  dataset_key: string;
  version: string;
  effective_date: string;
  review_state: string;
  wage_basis: string;
  coverage: unknown;
  limitations: string;
};

export type OccupationWageRow = {
  snapshot_id: string;
  occupation_code: string;
  title: string;
  industry_code: string;
  p25_cents: string | null;
  median_cents: string | null;
  p75_cents: string | null;
  wage_basis: string;
  coverage: unknown;
};

export type WageLookup =
  | {
      available: true;
      title: string;
      datasetKey: string;
      version: string;
      effectiveDate: string;
      wageBasis: string;
      p25Cents: number | null;
      medianCents: number | null;
      p75Cents: number | null;
      coverage: unknown;
      limitations: string;
      demo: boolean;
    }
  | { available: false; reason: string };

export function lookupWages(
  snapshot: BenchmarkSnapshotRow,
  occupation: OccupationWageRow | undefined
): WageLookup {
  if (snapshot.review_state !== "APPROVED" && snapshot.review_state !== "DEMO") {
    return { available: false, reason: "The benchmark snapshot is not approved for use." };
  }
  if (!occupation) {
    return { available: false, reason: "No matching occupation row exists in the snapshot." };
  }
  return {
    available: true,
    title: occupation.title,
    datasetKey: snapshot.dataset_key,
    version: snapshot.version,
    effectiveDate: snapshot.effective_date,
    wageBasis: occupation.wage_basis,
    p25Cents: occupation.p25_cents === null ? null : Number(occupation.p25_cents),
    medianCents: occupation.median_cents === null ? null : Number(occupation.median_cents),
    p75Cents: occupation.p75_cents === null ? null : Number(occupation.p75_cents),
    coverage: occupation.coverage,
    limitations: snapshot.limitations,
    demo: snapshot.review_state === "DEMO" || snapshot.dataset_key === "DEMO_FIXTURE"
  };
}

export type CandidateIngestRow = {
  occupation_code: string;
  title: string;
  industry_code?: string;
  p25_cents: number | null;
  median_cents: number | null;
  p75_cents: number | null;
  wage_basis: string;
  coverage?: Record<string, unknown>;
};

export function validateSnapshotRows(
  rows: CandidateIngestRow[]
): { ok: true; rows: CandidateIngestRow[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.occupation_code || !row.title) errors.push("Missing occupation code or title.");
    const key = `${row.occupation_code}:${row.industry_code ?? "ALL"}`;
    if (seen.has(key)) errors.push(`Duplicate classification ${key}.`);
    seen.add(key);
    const values = [row.p25_cents, row.median_cents, row.p75_cents];
    if (values.some((value) => value !== null && (!Number.isInteger(value) || value < 0))) {
      errors.push(`Invalid money for ${key}.`);
    }
    if (
      row.p25_cents !== null &&
      row.median_cents !== null &&
      row.p75_cents !== null &&
      !(row.p25_cents <= row.median_cents && row.median_cents <= row.p75_cents)
    ) {
      errors.push(`Percentiles are not ordered for ${key}.`);
    }
    if (!row.wage_basis) errors.push(`Missing wage basis for ${key}.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}
