import type { ReportRenderModel } from "@job-checker/contracts";
import { formatCents } from "@job-checker/contracts";

const PROHIBITED = [
  /\billegal\b/i,
  /\bunlawful\b/i,
  /\bwage theft\b/i,
  /\byou will win\b/i,
  /\bguaranteed (outcome|compensation)\b/i,
  /\bthis offer is (bad|good)\b/i
];

export type ValidationResult = { ok: boolean; errors: string[] };

export function allowedAmounts(model: ReportRenderModel): Set<string> {
  const values = new Set<string>();
  values.add(formatCents(model.factsSummary.basicMonthlySalary.cents));
  for (const section of model.sections) {
    for (const item of section.values) {
      const matches = item.value.match(/S\$[\d,]+(?:\.\d{2})?/g) ?? [];
      for (const match of matches) values.add(match);
    }
  }
  return values;
}

export function validateExplanation(
  text: string,
  model: ReportRenderModel,
  approvedUrls: string[]
): ValidationResult {
  const errors: string[] = [];
  for (const pattern of PROHIBITED) {
    if (pattern.test(text)) errors.push(`Prohibited claim: ${pattern.source}`);
  }
  const amounts = text.match(/S\$[\d,]+(?:\.\d{2})?/g) ?? [];
  const allowed = allowedAmounts(model);
  for (const amount of amounts) {
    if (!allowed.has(amount)) errors.push(`Unsupported amount: ${amount}`);
  }
  const urls = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  for (const url of urls) {
    if (!approvedUrls.includes(url)) errors.push(`Unapproved URL: ${url}`);
  }
  return { ok: errors.length === 0, errors };
}

export type Observation = { key: string; text: string; evidenceKeys: string[] };

export function explainEvidence(model: ReportRenderModel): Observation[] {
  const observations: Observation[] = [];
  const benchmark = model.sections.find((section) => section.key === "benchmark");
  const cpf = model.sections.find((section) => section.key === "cpf");
  const ket = model.sections.find((section) => section.key === "ket");
  const missingKet = ket?.items?.filter((item) => item.status === "MISSING") ?? [];

  if (cpf) {
    const employee = cpf.values.find((item) => item.label === "Employee CPF");
    if (employee) {
      observations.push({
        key: "obs.cpf",
        text: `Using the confirmed facts, the employee CPF contribution is ${employee.value}. This is a deterministic estimate, not a payslip.`,
        evidenceKeys: ["cpf.contribution"]
      });
    }
  }
  if (benchmark) {
    const median = benchmark.values.find((item) => item.label === "Median");
    if (median && median.value !== "Unavailable") {
      observations.push({
        key: "obs.benchmark",
        text: `The displayed median is ${median.value}. It is context only; it does not decide whether the offer is acceptable, and its basis and limitations are shown beside it.`,
        evidenceKeys: ["benchmark.occupation"]
      });
    }
  }
  if (missingKet.length > 0) {
    observations.push({
      key: "obs.ket",
      text: `${missingKet.length} Key Employment Term item(s) are not stated. Ask HR to clarify them; a missing item is not automatically unlawful.`,
      evidenceKeys: missingKet.map((item) => item.evidenceKey ?? item.key)
    });
  }
  return observations;
}

export function draftHrMessage(
  model: ReportRenderModel,
  selectedQuestionIds: string[]
): { subject: string; body: string; evidenceKeys: string[] } {
  const selected = model.questions.filter((question) => selectedQuestionIds.includes(question.id));
  const questions = selected.length > 0 ? selected : model.questions;
  const evidenceKeys = [
    ...new Set(questions.map((q) => q.evidenceKey).filter((k): k is string => Boolean(k)))
  ];

  const body = [
    "Hello,",
    "",
    `Thank you for the ${model.documentKind === "OFFER" ? "offer" : "employment contract"} for the ${model.factsSummary.jobTitle} role, starting ${model.factsSummary.startDate}.`,
    "",
    "Before I proceed, could you please clarify the following:",
    ...questions.map((question, index) => `${index + 1}. ${question.text}`),
    "",
    "For reference, my current understanding from the document is:",
    `- Basic monthly salary: ${formatCents(model.factsSummary.basicMonthlySalary.cents)}`,
    `- Employer: ${model.factsSummary.employer}`,
    "",
    "Could you confirm these in writing? Thank you.",
    "",
    "Best regards,",
    model.factsSummary.employeeName
  ].join("\n");

  const validation = validateExplanation(
    body,
    model,
    model.sources.map((source) => source.url)
  );
  if (!validation.ok) {
    return {
      subject: "Questions on the employment terms",
      body: [
        "Hello,",
        "",
        "Before I proceed, could you please clarify the key employment terms and salary components in the document?",
        "",
        "Thank you.",
        "",
        "Best regards,",
        model.factsSummary.employeeName
      ].join("\n"),
      evidenceKeys
    };
  }
  return { subject: "Questions on the employment terms", body, evidenceKeys };
}
