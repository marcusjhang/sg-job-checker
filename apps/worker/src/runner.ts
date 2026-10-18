import type { Kysely } from "kysely";
import type { Database, JobsTable } from "@job-checker/db";
import type { Selectable } from "kysely";
import { completeJob, failJob, retryJob, type JobKind } from "@job-checker/db";
import { AppError } from "@job-checker/contracts";
import { errorCodeOf, logger } from "@job-checker/observability";
import { executeDeletion } from "@job-checker/documents";
import {
  expireRetentionJob,
  extractDocumentJob,
  markAffectedReportsJob,
  scanDocument,
  type HandlerResult
} from "./handlers";

type Handler = (db: Kysely<Database>, job: Selectable<JobsTable>) => Promise<HandlerResult>;

const HANDLERS: Partial<Record<JobKind, Handler>> = {
  SCAN_DOCUMENT: scanDocument,
  EXTRACT_DOCUMENT: extractDocumentJob,
  DELETE_DOCUMENT: async (db, job) => {
    const result = await executeDeletion(db, job);
    return result === "CANCELLED_STALE" ? "CANCELLED_STALE" : "COMPLETED";
  },
  EXPIRE_RETENTION: expireRetentionJob,
  MARK_AFFECTED_REPORTS: markAffectedReportsJob
};

export async function processJob(
  db: Kysely<Database>,
  job: Selectable<JobsTable>,
  workerId: string
): Promise<void> {
  const handler = HANDLERS[job.kind as JobKind];
  if (!handler) {
    await failJob(db, job.id, workerId, "HANDLER_NOT_CONFIGURED");
    logger.warn({
      event: "job.unhandled",
      jobId: job.id,
      jobKind: job.kind,
      errorCode: "HANDLER_NOT_CONFIGURED"
    });
    return;
  }
  try {
    const result = await handler(db, job);
    const completed = await completeJob(db, job.id, workerId);
    logger.info({
      event: "job.completed",
      jobId: job.id,
      jobKind: job.kind,
      outcome: completed ? result : "LEASE_LOST",
      attempt: job.attempt_count
    });
  } catch (error) {
    const code = errorCodeOf(error);
    const retryable = error instanceof AppError ? error.retryable : true;
    if (retryable) {
      const delay =
        Math.min(300, 2 ** Math.max(0, job.attempt_count - 1) * 5) + Math.floor(Math.random() * 3);
      const outcome = await retryJob(db, job.id, workerId, code, delay);
      logger.warn({
        event: "job.retry",
        jobId: job.id,
        jobKind: job.kind,
        errorCode: code,
        attempt: job.attempt_count,
        outcome
      });
    } else {
      await failJob(db, job.id, workerId, code);
      logger.error({
        event: "job.failed",
        jobId: job.id,
        jobKind: job.kind,
        errorCode: code,
        attempt: job.attempt_count
      });
    }
  }
}
