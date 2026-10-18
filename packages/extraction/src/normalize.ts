import { parseMoneyToCents, sgd } from "@job-checker/contracts";
import type { PageArtefact, ProposedField, ProposedFieldSet } from "./provider";
import { EXTRACTABLE_FIELD_KEYS } from "./provider";

export class ExtractionOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionOutputError";
  }
}

export function redactSensitive(text: string): {
  text: string;
  nricCount: number;
  accountCount: number;
} {
  let nricCount = 0;
  let accountCount = 0;
  const masked = text
    .replace(/\b[STFGM]\d{7}[A-Z]\b/gi, (match) => {
      nricCount += 1;
      return "*".repeat(match.length);
    })
    .replace(/\b\d{10,16}\b/g, (match) => {
      accountCount += 1;
      return "*".repeat(match.length);
    });
  return { text: masked, nricCount, accountCount };
}

const ALLOWED = new Set<string>(EXTRACTABLE_FIELD_KEYS);

function normalizeValue(fieldKey: string, value: unknown): unknown {
  if (fieldKey === "basicMonthlySalary") {
    if (typeof value === "string") {
      const cents = parseMoneyToCents(value);
      return cents === null ? null : sgd(cents);
    }
    if (value && typeof value === "object" && "cents" in value) {
      const cents = Number((value as { cents: unknown }).cents);
      return Number.isInteger(cents) ? sgd(cents) : null;
    }
  }
  if (typeof value === "string") return value.slice(0, 10_000).trim();
  return value;
}

function pageText(pages: PageArtefact[], pageNumber: number | undefined): string | null {
  if (!pageNumber) return null;
  return pages.find((page) => page.pageNumber === pageNumber)?.text ?? null;
}

export function normalizeProposedFieldSet(
  proposed: ProposedFieldSet,
  pages: PageArtefact[]
): ProposedFieldSet {
  const seen = new Set<string>();
  const fields: ProposedField[] = [];

  for (const field of proposed.fields) {
    if (!ALLOWED.has(field.fieldKey)) {
      throw new ExtractionOutputError(`Unknown extraction field: ${field.fieldKey}`);
    }
    if (seen.has(field.fieldKey)) {
      throw new ExtractionOutputError(`Duplicate extraction field: ${field.fieldKey}`);
    }
    seen.add(field.fieldKey);

    const value = normalizeValue(field.fieldKey, field.value);
    let status = field.status;
    let confidence = field.confidence;
    let pageNumber = field.pageNumber;
    let sourceSpan = field.sourceSpan?.slice(0, 2_000);

    if (status === "PRESENT") {
      const text = pageText(pages, pageNumber);
      if (value === null || value === undefined || value === "") {
        status = "UNCERTAIN";
        confidence = null;
      } else if (!text) {
        status = "UNCERTAIN";
        confidence = null;
      } else if (sourceSpan) {
        const normalizedPage = text.replace(/\s+/g, " ").trim();
        const normalizedSpan = sourceSpan.replace(/\s+/g, " ").trim();
        if (!normalizedPage.includes(normalizedSpan)) {
          status = "UNCERTAIN";
          confidence = null;
        }
      }
    }
    if (status !== "PRESENT") {
      confidence = null;
    }
    if (!pageNumber) {
      pageNumber = undefined;
      sourceSpan = undefined;
    }

    const normalized: ProposedField = {
      fieldKey: field.fieldKey,
      value: status === "PRESENT" ? value : null,
      status,
      confidence
    };
    if (pageNumber !== undefined) normalized.pageNumber = pageNumber;
    if (sourceSpan !== undefined && status === "PRESENT") normalized.sourceSpan = sourceSpan;
    fields.push(normalized);
  }

  return {
    schemaVersion: proposed.schemaVersion,
    provider: proposed.provider,
    fields,
    redaction: proposed.redaction
  };
}
