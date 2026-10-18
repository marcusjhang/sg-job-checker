import pino from "pino";
import { env } from "./env";

/**
 * Allowlisted telemetry. Unknown fields are dropped, so a caller cannot
 * accidentally log document text, salary, filenames, prompts, or URLs.
 */
const ALLOWED_FIELDS = new Set([
  "event",
  "correlationId",
  "userIdHash",
  "documentIdHash",
  "jobId",
  "jobKind",
  "state",
  "fromState",
  "toState",
  "durationMs",
  "count",
  "bytesBucket",
  "pagesBucket",
  "errorCode",
  "retryable",
  "attempt",
  "ruleKey",
  "ruleVersion",
  "sourceKey",
  "reportId",
  "reportVersion",
  "provider",
  "model",
  "route",
  "status",
  "method",
  "outcome",
  "queueDepth",
  "workerId"
]);

const ALLOWED_PREFIXES = ["_"];

function isAllowed(key: string): boolean {
  return ALLOWED_FIELDS.has(key) || ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function scalar(value: unknown): string | number | boolean | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return "[filtered]";
}

export type TelemetryFields = Record<string, unknown>;

export function sanitize(
  fields: TelemetryFields
): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!isAllowed(key)) continue;
    output[key] = scalar(value);
  }
  return output;
}

const base = pino({
  level: env().LOG_LEVEL,
  base: { service: "job-checker" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) }
});

export const logger = {
  info(fields: TelemetryFields, message = "event") {
    base.info(sanitize(fields), message);
  },
  warn(fields: TelemetryFields, message = "event") {
    base.warn(sanitize(fields), message);
  },
  error(fields: TelemetryFields, message = "event") {
    base.error(sanitize(fields), message);
  },
  debug(fields: TelemetryFields, message = "event") {
    base.debug(sanitize(fields), message);
  }
};

/** Errors are converted to stable codes before logging. Never log the message. */
export function errorCodeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,60}$/.test(code)) return code;
  }
  return "INTERNAL";
}

export function bytesBucket(bytes: number): string {
  if (bytes < 64 * 1024) return "<64KB";
  if (bytes < 1024 * 1024) return "<1MB";
  if (bytes < 5 * 1024 * 1024) return "<5MB";
  if (bytes < 20 * 1024 * 1024) return "<20MB";
  return ">=20MB";
}

export function pagesBucket(pages: number): string {
  if (pages <= 1) return "1";
  if (pages <= 5) return "2-5";
  if (pages <= 10) return "6-10";
  if (pages <= 20) return "11-20";
  return "21+";
}
