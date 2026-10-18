import { parseMoneyToCents, sgd } from "@job-checker/contracts";
import type { ExtractionProvider, PageArtefact, ProposedField, ProposedFieldSet } from "./provider";
import { EXTRACTION_SCHEMA_VERSION, PROMPT_TEMPLATE_HASH } from "./provider";
import { redactSensitive } from "./normalize";
import { env } from "@job-checker/observability/env";

function findDate(text: string, label: RegExp): { value: string; span: string } | null {
  const match = label.exec(text);
  if (!match) return null;
  const tail = text.slice(match.index, match.index + 120);
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(tail);
  if (iso?.[1]) return { value: iso[1], span: iso[0] };
  const dmy =
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i.exec(tail);
  if (dmy?.[1] && dmy[2] && dmy[3]) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec"
    ];
    const month = months.indexOf(dmy[2].toLowerCase().slice(0, 3)) + 1;
    return {
      value: `${dmy[3]}-${String(month).padStart(2, "0")}-${dmy[1].padStart(2, "0")}`,
      span: dmy[0]
    };
  }
  return null;
}

function findText(text: string, label: RegExp, max = 200): { value: string; span: string } | null {
  const match = label.exec(text);
  if (!match?.[1]) return null;
  const value = match[1].split("\n")[0]?.trim().slice(0, max) ?? "";
  return value ? { value, span: value } : null;
}

function field(
  key: string,
  found: { value: unknown; span?: string | undefined } | null,
  pageNumber: number,
  confidence = 0.85
): ProposedField {
  if (!found) {
    return { fieldKey: key, value: null, status: "ABSENT", confidence: null };
  }
  const result: ProposedField = {
    fieldKey: key,
    value: found.value,
    status: "PRESENT",
    confidence,
    pageNumber
  };
  if (found.span) result.sourceSpan = found.span;
  return result;
}

function pageOf(pages: PageArtefact[], span: string | undefined): number {
  if (!span) return pages[0]?.pageNumber ?? 1;
  const found = pages.find((page) => page.text.includes(span));
  return found?.pageNumber ?? pages[0]?.pageNumber ?? 1;
}

/**
 * Phase 1A deterministic extractor. It reads text from clean, sanitised pages and
 * proposes only literal values. It never follows document instructions and never
 * invents a value. Manual review and explicit confirmation remain mandatory.
 */
export class DeterministicDocumentProvider implements ExtractionProvider {
  async extract(pages: PageArtefact[]): Promise<ProposedFieldSet> {
    const joined = pages.map((page) => page.text).join("\n");
    const redaction = redactSensitive(joined);
    const text = redaction.text;

    const salaryMatch =
      /(?:basic|monthly)\s+(?:salary|pay)[^\n$S]{0,40}(?:S\$|\$)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(
        text
      );
    const salaryCents = salaryMatch?.[1] ? parseMoneyToCents(salaryMatch[1]) : null;
    const salaryFound =
      salaryCents === null || !salaryMatch?.[0]
        ? null
        : { value: sgd(salaryCents), span: salaryMatch[0] };

    const start = findDate(text, /(?:start\s+date|commencement\s+date|effective\s+date)/i);
    const dob = findDate(text, /(?:date\s+of\s+birth|birth\s+date|d\.o\.b\.?)/i);

    const employer = findText(text, /(?:company|employer)\s*(?:name)?\s*:\s*([^\n]+)/i);
    const employee = findText(text, /(?:employee\s+name|name)\s*:\s*([^\n]+)/i);
    const title = findText(text, /(?:job\s+title|position|designation)\s*:\s*([^\n]+)/i);
    const duties = findText(
      text,
      /(?:duties|responsibilities)\s*:\s*([\s\S]{1,800}?)(?:\n\s*\n|$)/i,
      800
    );
    const leaveAnnual = findText(text, /annual\s+leave\s*:\s*([^\n]+)/i);
    const leaveSick = findText(text, /(?:sick\s+leave|outpatient\s+leave)\s*:\s*([^\n]+)/i);
    const leaveHosp = findText(text, /hospitalisation\s+leave\s*:\s*([^\n]+)/i);
    const medical = findText(text, /medical\s+benefits?\s*:\s*([^\n]+)/i);
    const probation = findText(text, /probation(?: period)?\s*:\s*([^\n]+)/i);
    const notice = findText(text, /notice\s+period\s*:\s*([^\n]+)/i);
    const place = findText(text, /place\s+of\s+work\s*:\s*([^\n]+)/i);
    const salaryPeriod = findText(text, /salary\s+period\s*:\s*([^\n]+)/i);
    const restDay = findText(text, /rest\s+day\s*:\s*([^\n]+)/i);
    const overtimeRate = findText(text, /overtime\s+(?:rate|pay)\s*:\s*([^\n]+)/i);
    const overtimePeriod = findText(text, /overtime\s+period\s*:\s*([^\n]+)/i);
    const hours = findText(text, /(?:working\s+hours|hours\s+per\s+day)\s*:\s*([^\n]+)/i);
    const days = findText(text, /(?:working\s+days|days\s+per\s+week)\s*:\s*([^\n]+)/i);

    const hoursValue = hours?.value
      ? (/(\d{1,2}(?:\.\d{1,2})?)\s*(?:hours?|hrs?)/i.exec(hours.value)?.[1] ?? null)
      : null;
    const daysValue = days?.value
      ? (/(\d{1,2}(?:\.\d{1,2})?)/.exec(days.value)?.[1] ?? null)
      : null;

    const kindFound = /offer\s+letter/i.test(text)
      ? { value: "OFFER", span: "offer letter" }
      : /employment\s+contract|contract\s+of\s+service/i.test(text)
        ? { value: "CONTRACT", span: "employment contract" }
        : null;

    const fields: ProposedField[] = [
      field("documentKind", kindFound, pageOf(pages, kindFound?.span), 0.8),
      field("basicMonthlySalary", salaryFound, pageOf(pages, salaryFound?.span), 0.9),
      field("startDate", start, pageOf(pages, start?.span), 0.85),
      field("dateOfBirth", dob, pageOf(pages, dob?.span), 0.85),
      field("employer.legalName", employer, pageOf(pages, employer?.span), 0.8),
      field("employeeName", employee, pageOf(pages, employee?.span), 0.8),
      field("jobTitle", title, pageOf(pages, title?.span), 0.85),
      field(
        "duties",
        duties
          ? {
              value: duties.value
                .split(/\n|;/)
                .map((item) => item.replace(/^[-•\d.\s]+/, "").trim())
                .filter(Boolean)
                .slice(0, 20),
              span: duties.span.slice(0, 120)
            }
          : null,
        pageOf(pages, duties?.span),
        0.7
      ),
      field("leave.annual", leaveAnnual, pageOf(pages, leaveAnnual?.span), 0.8),
      field("leave.sick", leaveSick, pageOf(pages, leaveSick?.span), 0.8),
      field("leave.hospitalisation", leaveHosp, pageOf(pages, leaveHosp?.span), 0.8),
      field("medicalBenefits", medical, pageOf(pages, medical?.span), 0.8),
      field("probation", probation, pageOf(pages, probation?.span), 0.85),
      field("noticePeriod", notice, pageOf(pages, notice?.span), 0.85),
      field("placeOfWork", place, pageOf(pages, place?.span), 0.8),
      field("salaryPeriod", salaryPeriod, pageOf(pages, salaryPeriod?.span), 0.8),
      field("restDay", restDay, pageOf(pages, restDay?.span), 0.8),
      field("overtime.rate", overtimeRate, pageOf(pages, overtimeRate?.span), 0.8),
      field("overtime.period", overtimePeriod, pageOf(pages, overtimePeriod?.span), 0.8),
      field(
        "workingHoursPerDay",
        hoursValue ? { value: hoursValue, span: hours?.value } : null,
        pageOf(pages, hours?.span),
        0.7
      ),
      field(
        "workingDaysPerWeek",
        daysValue ? { value: daysValue, span: days?.value } : null,
        pageOf(pages, days?.span),
        0.7
      )
    ];

    return {
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      provider: {
        name: "deterministic-local",
        model: "regex-text-v1",
        promptTemplateHash: PROMPT_TEMPLATE_HASH
      },
      fields,
      redaction: { nricCount: redaction.nricCount, accountCount: redaction.accountCount }
    };
  }
}

export function createExtractionProvider(): ExtractionProvider {
  if (env().EXTRACTION_PROVIDER !== "deterministic") {
    throw new Error(
      "External extraction providers are disabled until Privacy and Security verify no-training and retention terms."
    );
  }
  return new DeterministicDocumentProvider();
}

export async function pageArtefactsFromPdf(
  bytes: Buffer
): Promise<Array<{ pageNumber: number; text: string }>> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const result = await extractText(pdf, { mergePages: false });
  const texts = Array.isArray(result.text) ? result.text : [String(result.text)];
  return texts.map((text, index) => ({ pageNumber: index + 1, text: text ?? "" }));
}
