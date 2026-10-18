import { describe, expect, it } from "vitest";
import { matchOccupation, validateSnapshotRows, lookupWages } from "@job-checker/benchmarks";
import { makeFacts } from "../../../tests/factories";

const occupations = [
  {
    snapshot_id: "s1",
    occupation_code: "25121",
    title: "Software Developer",
    industry_code: "ALL",
    p25_cents: "650000",
    median_cents: "850000",
    p75_cents: "1100000",
    wage_basis: "GROSS_MONTHLY_INCLUDING_BONUS",
    coverage: {}
  },
  {
    snapshot_id: "s1",
    occupation_code: "24111",
    title: "Accountant",
    industry_code: "ALL",
    p25_cents: "450000",
    median_cents: "600000",
    p75_cents: "800000",
    wage_basis: "GROSS_MONTHLY_INCLUDING_BONUS",
    coverage: {}
  },
  {
    snapshot_id: "s1",
    occupation_code: "24311",
    title: "Marketing Executive",
    industry_code: "ALL",
    p25_cents: "400000",
    median_cents: "520000",
    p75_cents: "680000",
    wage_basis: "GROSS_MONTHLY_INCLUDING_BONUS",
    coverage: {}
  }
];

describe("occupation matching", () => {
  it("ranks the software developer first from title and duties", () => {
    const candidates = matchOccupation(
      makeFacts({
        jobTitle: "Senior Software Engineer",
        duties: ["Build TypeScript APIs", "Work with React and databases", "Review code"]
      }),
      occupations
    );
    expect(candidates[0]?.code).toBe("25121");
    expect(candidates[0]?.matchedSignals.length).toBeGreaterThan(0);
    expect(["HIGH", "MEDIUM"]).toContain(candidates[0]?.confidence);
  });

  it("returns no candidate when nothing overlaps", () => {
    const candidates = matchOccupation(
      makeFacts({ jobTitle: "Marine Biologist", duties: ["Study coral reefs"] }),
      occupations
    );
    expect(candidates).toEqual([]);
  });

  it("does not expose scores as calibrated probabilities", () => {
    const candidates = matchOccupation(makeFacts(), occupations);
    for (const candidate of candidates) {
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(candidate.confidence);
      expect(candidate.score).toBeLessThanOrEqual(1);
    }
  });
});

describe("benchmark lookup", () => {
  it("always returns basis, date, and limitations with percentiles", () => {
    const lookup = lookupWages(
      {
        id: "s1",
        dataset_key: "DEMO_FIXTURE",
        version: "2026.1",
        effective_date: "2026-10-01",
        review_state: "DEMO",
        wage_basis: "GROSS_MONTHLY_INCLUDING_BONUS",
        coverage: { demo: true },
        limitations: "Demonstration data"
      },
      occupations[0]
    );
    if (!lookup.available) throw new Error("expected available");
    expect(lookup.effectiveDate).toBe("2026-10-01");
    expect(lookup.wageBasis).toBe("GROSS_MONTHLY_INCLUDING_BONUS");
    expect(lookup.limitations).toContain("Demonstration");
    expect(lookup.demo).toBe(true);
  });

  it("returns unavailable for a missing row", () => {
    const lookup = lookupWages(
      {
        id: "s1",
        dataset_key: "X",
        version: "1",
        effective_date: "2026-01-01",
        review_state: "APPROVED",
        wage_basis: "X",
        coverage: {},
        limitations: "X"
      },
      undefined
    );
    expect(lookup.available).toBe(false);
  });
});

describe("benchmark ingestion", () => {
  it("rejects unordered percentiles and duplicate classifications", () => {
    const result = validateSnapshotRows([
      {
        occupation_code: "1",
        title: "X",
        p25_cents: 100,
        median_cents: 50,
        p75_cents: 200,
        wage_basis: "GROSS"
      },
      {
        occupation_code: "1",
        title: "X",
        p25_cents: 100,
        median_cents: 150,
        p75_cents: 200,
        wage_basis: "GROSS"
      }
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("not ordered"))).toBe(true);
      expect(result.errors.some((error) => error.includes("Duplicate"))).toBe(true);
    }
  });
});
