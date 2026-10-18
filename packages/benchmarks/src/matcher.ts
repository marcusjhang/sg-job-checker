import type { ConfirmedEmploymentFactsV1 } from "@job-checker/contracts";

export type OccupationCandidateRow = {
  occupation_code: string;
  title: string;
  industry_code: string;
  p25_cents: string | null;
  median_cents: string | null;
  p75_cents: string | null;
};

export type Candidate = {
  code: string;
  title: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  matchedSignals: string[];
};

const STOPWORDS = new Set([
  "and",
  "the",
  "of",
  "for",
  "to",
  "with",
  "a",
  "an",
  "in",
  "on",
  "as",
  "is",
  "are",
  "be",
  "responsible",
  "responsibilities",
  "including",
  "support",
  "team",
  "work",
  "role",
  "job"
]);

const PROFILES: Record<string, { keywords: string[]; titleTokens: string[] }> = {
  "25121": {
    titleTokens: ["software", "developer", "engineer", "programmer"],
    keywords: [
      "software",
      "code",
      "coding",
      "typescript",
      "javascript",
      "python",
      "java",
      "react",
      "backend",
      "frontend",
      "api",
      "database",
      "cloud",
      "developer",
      "engineering"
    ]
  },
  "24111": {
    titleTokens: ["accountant", "accounting"],
    keywords: [
      "accounting",
      "ledger",
      "audit",
      "financial statements",
      "tax",
      "bookkeeping",
      "gst",
      "reconciliation"
    ]
  },
  "24221": {
    titleTokens: ["human", "resource", "hr", "people"],
    keywords: [
      "recruitment",
      "payroll",
      "employee relations",
      "hr",
      "onboarding",
      "compensation",
      "benefits",
      "talent"
    ]
  },
  "24311": {
    titleTokens: ["marketing", "brand", "communications"],
    keywords: [
      "marketing",
      "campaign",
      "brand",
      "social media",
      "content",
      "advertising",
      "seo",
      "communications"
    ]
  },
  "12111": {
    titleTokens: ["operations", "manager", "general"],
    keywords: [
      "operations",
      "logistics",
      "process",
      "team management",
      "budget",
      "vendor",
      "supply chain",
      "manager"
    ]
  },
  "24121": {
    titleTokens: ["financial", "analyst", "finance"],
    keywords: [
      "financial modelling",
      "valuation",
      "forecast",
      "budget",
      "analysis",
      "investment",
      "excel",
      "reporting"
    ]
  },
  "24211": {
    titleTokens: ["consultant", "consulting", "strategy"],
    keywords: [
      "consulting",
      "client",
      "strategy",
      "advisory",
      "stakeholder",
      "transformation",
      "analysis"
    ]
  },
  "35121": {
    titleTokens: ["data", "analyst", "analytics"],
    keywords: [
      "data",
      "sql",
      "analytics",
      "dashboard",
      "statistics",
      "visualisation",
      "visualization",
      "etl",
      "reporting"
    ]
  }
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function matchOccupation(
  facts: ConfirmedEmploymentFactsV1,
  occupations: OccupationCandidateRow[],
  limit = 5
): Candidate[] {
  const titleTokens = new Set(tokenize(facts.jobTitle));
  const dutyTokens = new Set(
    tokenize(`${facts.duties.join(" ")} ${facts.industryDescription ?? ""}`)
  );

  const candidates = occupations.map((occupation) => {
    const profile = PROFILES[occupation.occupation_code];
    const matchedSignals: string[] = [];
    let titleScore = 0;
    let dutyScore = 0;

    if (profile) {
      for (const token of profile.titleTokens) {
        if (titleTokens.has(token)) {
          titleScore += 1;
          matchedSignals.push(`title:${token}`);
        }
      }
      for (const keyword of profile.keywords) {
        if (dutyTokens.has(keyword) || facts.duties.join(" ").toLowerCase().includes(keyword)) {
          dutyScore += 1;
          matchedSignals.push(`duties:${keyword}`);
        }
      }
    } else {
      const occupationTitleTokens = tokenize(occupation.title);
      for (const token of occupationTitleTokens) {
        if (titleTokens.has(token)) {
          titleScore += 1;
          matchedSignals.push(`title:${token}`);
        }
      }
    }

    const titleMax = Math.max(1, profile?.titleTokens.length ?? 1);
    const dutyMax = Math.max(1, Math.min(6, profile?.keywords.length ?? 1));
    const score = Math.min(1, (titleScore / titleMax) * 0.65 + (dutyScore / dutyMax) * 0.35);

    const confidence = score >= 0.7 ? "HIGH" : score >= 0.4 ? "MEDIUM" : score > 0 ? "LOW" : "LOW";

    return {
      code: occupation.occupation_code,
      title: occupation.title,
      confidence,
      score: Number(score.toFixed(3)),
      matchedSignals: [...new Set(matchedSignals)].slice(0, 8)
    } satisfies Candidate;
  });

  return candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export const MATCHER_VERSION = "matcher-1.0.0";
