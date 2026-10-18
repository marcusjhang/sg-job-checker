import { createHash } from "node:crypto";
import { CPF_RULES } from "./cpf/rules";

export type SeedSource = {
  key: string;
  owner: string;
  url: string;
  purpose: string;
  refreshPolicy: string;
  maxStaleDays: number;
  effectiveFrom: string;
};

export const SEED_SOURCES: SeedSource[] = [
  {
    key: "cpf-contribution-rates",
    owner: "CPF Board",
    url: "https://www.cpf.gov.sg/employer/employer-obligations/how-much-cpf-contributions-to-pay",
    purpose: "CPF contribution rates, wage bands, rounding, PR year rules",
    refreshPolicy: "monthly",
    maxStaleDays: 45,
    effectiveFrom: "2026-01-01"
  },
  {
    key: "cpf-wage-classification",
    owner: "CPF Board",
    url: "https://www.cpf.gov.sg/employer/employer-obligations/what-constitutes-wages-for-cpf-contributions",
    purpose: "OW/AW classification, OW ceiling, AW ceiling formula",
    refreshPolicy: "monthly",
    maxStaleDays: 45,
    effectiveFrom: "2026-01-01"
  },
  {
    key: "cpf-2027-rates",
    owner: "CPF Board",
    url: "https://www.cpf.gov.sg/employer/infohub/news/cpf-related-announcements/new-contribution-rates",
    purpose: "Published future-effective rates from 2027-01-01",
    refreshPolicy: "quarterly",
    maxStaleDays: 120,
    effectiveFrom: "2027-01-01"
  },
  {
    key: "mom-ket",
    owner: "Ministry of Manpower",
    url: "https://www.mom.gov.sg/employment-practices/contract-of-service/key-employment-terms",
    purpose: "Key Employment Terms item list and applicability",
    refreshPolicy: "quarterly",
    maxStaleDays: 180,
    effectiveFrom: "2026-01-01"
  },
  {
    key: "mom-hours-overtime",
    owner: "Ministry of Manpower",
    url: "https://www.mom.gov.sg/employment-practices/hours-of-work-overtime-and-rest-days",
    purpose: "Part IV coverage, hourly rate formula, overtime rate and cap",
    refreshPolicy: "quarterly",
    maxStaleDays: 180,
    effectiveFrom: "2026-01-01"
  },
  {
    key: "mom-annual-leave",
    owner: "Ministry of Manpower",
    url: "https://www.mom.gov.sg/employment-practices/leave/annual-leave",
    purpose: "Annual leave eligibility and entitlement",
    refreshPolicy: "quarterly",
    maxStaleDays: 180,
    effectiveFrom: "2026-01-01"
  },
  {
    key: "mom-occupational-wages",
    owner: "Ministry of Manpower",
    url: "https://www.mom.gov.sg/employment-practices/salary/occupational-wages",
    purpose: "Licensed occupational wage benchmarks and limitations",
    refreshPolicy: "annual",
    maxStaleDays: 400,
    effectiveFrom: "2026-10-01"
  }
];

export type SeedRule = {
  key: string;
  semanticVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  fixture: unknown;
  approvedBy: string;
  sourceKeys: string[];
};

export const SEED_RULES: SeedRule[] = [
  ...CPF_RULES.map((fixture) => ({
    key: "cpf.contribution",
    semanticVersion: fixture.semanticVersion,
    effectiveFrom: fixture.effectiveFrom,
    effectiveTo: fixture.effectiveTo,
    fixture,
    approvedBy:
      "seed-rules-reviewer (engineering fixture; production requires independent sign-off)",
    sourceKeys: fixture.semanticVersion.startsWith("2027")
      ? ["cpf-2027-rates", "cpf-wage-classification"]
      : ["cpf-contribution-rates", "cpf-wage-classification"]
  })),
  {
    key: "compensation.guaranteed",
    semanticVersion: "1.0.0",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    fixture: { version: 1, takeHomeExcludesTax: true },
    approvedBy: "seed-rules-reviewer (engineering fixture)",
    sourceKeys: ["cpf-wage-classification"]
  },
  {
    key: "ket.completeness",
    semanticVersion: "1.0.0",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    fixture: { version: 1, items: 18 },
    approvedBy: "seed-rules-reviewer (engineering fixture)",
    sourceKeys: ["mom-ket"]
  },
  {
    key: "employment-act.coverage",
    semanticVersion: "1.0.0",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    fixture: { version: 1, workmanLimitCents: 450000, nonWorkmanLimitCents: 260000 },
    approvedBy: "seed-rules-reviewer (engineering fixture)",
    sourceKeys: ["mom-hours-overtime"]
  },
  {
    key: "employment-act.rate-of-pay",
    semanticVersion: "1.0.0",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    fixture: { version: 1, divisorHoursPerWeek: 44 },
    approvedBy: "seed-rules-reviewer (engineering fixture)",
    sourceKeys: ["mom-hours-overtime"]
  },
  {
    key: "employment-act.overtime",
    semanticVersion: "1.0.0",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    fixture: { version: 1, multiplier: 1.5, capHours: 72 },
    approvedBy: "seed-rules-reviewer (engineering fixture)",
    sourceKeys: ["mom-hours-overtime"]
  },
  {
    key: "employment-act.leave",
    semanticVersion: "1.0.0",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    fixture: { version: 1, annual: "7 to 14", sickOutpatient: 14, sickHospitalisation: 60 },
    approvedBy: "seed-rules-reviewer (engineering fixture)",
    sourceKeys: ["mom-annual-leave"]
  },
  {
    key: "benchmark.occupation",
    semanticVersion: "1.0.0",
    effectiveFrom: "2026-10-01",
    effectiveTo: null,
    fixture: { version: 1, dataset: "DEMO_FIXTURE" },
    approvedBy: "seed-rules-reviewer (engineering fixture)",
    sourceKeys: ["mom-occupational-wages"]
  }
];

export const SEED_BENCHMARK = {
  datasetKey: "DEMO_FIXTURE",
  version: "2026.1",
  effectiveDate: "2026-10-01",
  wageBasis: "GROSS_MONTHLY_INCLUDING_BONUS",
  coverage: {
    note: "Demonstration fixture for product testing. Not official MOM statistics.",
    employeesCovered: "Illustrative only",
    exclusions: "No statistical inference should be drawn."
  },
  limitations:
    "DEMONSTRATION DATA — not official MOM Occupational Wages statistics. Do not use for a real pay decision. Production requires a licensed/approved official snapshot, human review, and the MOM limitations displayed beside the comparison.",
  occupations: [
    {
      code: "25121",
      title: "Software Developer",
      industry: "ALL",
      p25: 650_000,
      median: 850_000,
      p75: 1_100_000
    },
    {
      code: "24111",
      title: "Accountant",
      industry: "ALL",
      p25: 450_000,
      median: 600_000,
      p75: 800_000
    },
    {
      code: "24221",
      title: "Human Resource Executive",
      industry: "ALL",
      p25: 420_000,
      median: 550_000,
      p75: 720_000
    },
    {
      code: "24311",
      title: "Marketing Executive",
      industry: "ALL",
      p25: 400_000,
      median: 520_000,
      p75: 680_000
    },
    {
      code: "12111",
      title: "Operations Manager",
      industry: "ALL",
      p25: 600_000,
      median: 800_000,
      p75: 1_050_000
    },
    {
      code: "24121",
      title: "Financial Analyst",
      industry: "ALL",
      p25: 500_000,
      median: 680_000,
      p75: 900_000
    },
    {
      code: "24211",
      title: "Management Consultant",
      industry: "ALL",
      p25: 650_000,
      median: 900_000,
      p75: 1_200_000
    },
    {
      code: "35121",
      title: "Data Analyst",
      industry: "ALL",
      p25: 480_000,
      median: 620_000,
      p75: 820_000
    }
  ]
};

export function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
