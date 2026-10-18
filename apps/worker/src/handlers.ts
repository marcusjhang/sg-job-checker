import type { Kysely } from "kysely";
import type { Database, JobsTable } from "@job-checker/db";
import type { Selectable } from "kysely";
import { enqueueJob } from "@job-checker/db";
import { AppError, conflict, notFound } from "@job-checker/contracts";
import { recordAudit } from "@job-checker/audit";
import {
  deterministicUuid,
  objectStore,
  scanDocumentBytes,
  type AllowedMediaType
} from "@job-checker/documents";
import { extractDocument } from "@job-checker/extraction";
import { markAffectedReports } from "@job-checker/reports";

export type HandlerResult = "COMPLETED" | "CANCELLED_STALE";

async function loadDocument(trx: Kysely<Database>, job: Selectable<JobsTable>) {
  return trx
    .selectFrom("documents")
    .selectAll()
    .where("id", "=", job.subject_id)
    .where("user_id", "=", job.user_id)
    .executeTakeFirst();
}

export async function scanDocument(
  db: Kysely<Database>,
  job: Selectable<JobsTable>
): Promise<HandlerResult> {
  const started = await db.transaction().execute(async (trx) => {
    const document = await trx
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", job.subject_id)
      .where("user_id", "=", job.user_id)
      .forUpdate()
      .executeTakeFirst();
    if (
      !document ||
      !["UPLOADED", "SCANNING"].includes(document.state) ||
      document.version !== job.subject_version
    ) {
      return null;
    }
    if (document.state === "UPLOADED") {
      await trx
        .updateTable("documents")
        .set({ state: "SCANNING", updated_at: new Date() })
        .where("id", "=", document.id)
        .where("version", "=", document.version)
        .execute();
    }
    return document;
  });
  if (!started) return "CANCELLED_STALE";
  if (!started.object_key || !started.media_type) {
    throw new AppError("DOCUMENT_UNSAFE", 422, "The uploaded object is missing.");
  }

  let bytes: Buffer;
  try {
    bytes = await objectStore().get(started.object_key);
  } catch {
    throw new AppError("EXTRACTION_FAILED", 503, "The object store is unavailable.", {
      retryable: true
    });
  }
  const outcome = await scanDocumentBytes(bytes, started.media_type as AllowedMediaType);

  return db.transaction().execute(async (trx) => {
    const document = await trx
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", job.subject_id)
      .where("user_id", "=", job.user_id)
      .forUpdate()
      .executeTakeFirst();
    if (!document || document.version !== job.subject_version || document.state !== "SCANNING") {
      return "CANCELLED_STALE";
    }
    const existingFinding = await trx
      .selectFrom("scan_findings")
      .select("id")
      .where("document_id", "=", document.id)
      .where("document_version", "=", document.version)
      .executeTakeFirst();
    if (!existingFinding) {
      await trx
        .insertInto("scan_findings")
        .values({
          user_id: job.user_id,
          document_id: document.id,
          document_version: document.version,
          scanner_version: outcome.scannerVersion,
          verdict: outcome.verdict,
          reason_code: outcome.reasonCode
        })
        .execute();
    }

    if (outcome.verdict === "CLEAN") {
      await enqueueJob(trx, {
        userId: job.user_id,
        kind: "EXTRACT_DOCUMENT",
        subjectId: document.id,
        subjectVersion: document.version,
        occurrenceKey: deterministicUuid(`extract:${document.id}:${document.version}`),
        payload: { documentVersion: document.version },
        maxAttempts: 3
      });
    } else {
      const nextState = outcome.verdict === "QUARANTINED" ? "QUARANTINED" : "NEEDS_INPUT";
      await trx
        .updateTable("documents")
        .set({ state: nextState, updated_at: new Date() })
        .where("id", "=", document.id)
        .where("version", "=", document.version)
        .execute();
    }

    await recordAudit(trx, {
      userId: job.user_id,
      actorType: "WORKER",
      action: "document.scan",
      subjectType: "document",
      subjectId: document.id,
      result: outcome.verdict === "CLEAN" ? "SUCCESS" : "FAILURE",
      metadata: { verdict: outcome.verdict, reasonCode: outcome.reasonCode }
    });
    return "COMPLETED";
  });
}

export async function extractDocumentJob(
  db: Kysely<Database>,
  job: Selectable<JobsTable>
): Promise<HandlerResult> {
  const document = await db
    .selectFrom("documents")
    .selectAll()
    .where("id", "=", job.subject_id)
    .where("user_id", "=", job.user_id)
    .executeTakeFirst();
  if (!document || document.version !== job.subject_version || document.state !== "SCANNING") {
    return "CANCELLED_STALE";
  }
  if (!document.object_key || !document.media_type) {
    throw new AppError("EXTRACTION_FAILED", 422, "The document has no object.");
  }
  let bytes: Buffer;
  try {
    bytes = await objectStore().get(document.object_key);
  } catch {
    throw new AppError("EXTRACTION_FAILED", 503, "The object store is unavailable.", {
      retryable: true
    });
  }
  try {
    await db.transaction().execute(async (trx) => {
      await extractDocument(trx, {
        userId: job.user_id,
        documentId: document.id,
        documentVersion: document.version,
        bytes,
        mediaType: document.media_type ?? ""
      });
    });
    return "COMPLETED";
  } catch (error) {
    if (error instanceof AppError && error.code === "EXTRACTION_FAILED") {
      await db.transaction().execute(async (trx) => {
        const current = await trx
          .selectFrom("documents")
          .selectAll()
          .where("id", "=", document.id)
          .where("user_id", "=", job.user_id)
          .forUpdate()
          .executeTakeFirst();
        if (!current || current.version !== job.subject_version || current.state !== "SCANNING")
          return;
        await trx
          .updateTable("documents")
          .set({ state: "NEEDS_INPUT", updated_at: new Date() })
          .where("id", "=", current.id)
          .execute();
        await recordAudit(trx, {
          userId: job.user_id,
          actorType: "WORKER",
          action: "extraction.needs_input",
          subjectType: "document",
          subjectId: current.id,
          result: "FAILURE",
          metadata: { reasonCode: error.code }
        });
      });
      return "COMPLETED";
    }
    if (error instanceof AppError && error.code === "DOCUMENT_UNSAFE") {
      await db.transaction().execute(async (trx) => {
        const current = await trx
          .selectFrom("documents")
          .selectAll()
          .where("id", "=", document.id)
          .where("user_id", "=", job.user_id)
          .forUpdate()
          .executeTakeFirst();
        if (!current || current.version !== job.subject_version || current.state !== "SCANNING")
          return;
        await trx
          .insertInto("scan_findings")
          .values({
            user_id: job.user_id,
            document_id: current.id,
            document_version: current.version,
            scanner_version: "extraction-preflight-1.0",
            verdict: "QUARANTINED",
            reason_code: "PAGE_LIMIT"
          })
          .execute();
        await trx
          .updateTable("documents")
          .set({ state: "QUARANTINED", updated_at: new Date() })
          .where("id", "=", current.id)
          .execute();
      });
      return "COMPLETED";
    }
    if (error instanceof AppError && !error.retryable) {
      throw error;
    }
    throw new AppError("EXTRACTION_FAILED", 503, "Extraction failed.", { retryable: true });
  }
}

export async function expireRetentionJob(
  db: Kysely<Database>,
  job: Selectable<JobsTable>
): Promise<HandlerResult> {
  const payload = job.payload as { phase?: string; documentVersion?: string };
  if (payload.phase === "raw") {
    const { purgeRawArtefacts } = await import("@job-checker/documents");
    const result = await purgeRawArtefacts(
      db,
      job.subject_id,
      payload.documentVersion ?? job.subject_version
    );
    return result === "PURGED" ? "COMPLETED" : "CANCELLED_STALE";
  }
  const { expireRetention } = await import("@job-checker/documents");
  await expireRetention(db);
  return "COMPLETED";
}

export async function markAffectedReportsJob(
  db: Kysely<Database>,
  job: Selectable<JobsTable>
): Promise<HandlerResult> {
  const payload = job.payload as { dependencyType?: string; dependencyId?: string };
  if (!payload.dependencyType || !payload.dependencyId) {
    throw new AppError("VALIDATION_FAILED", 422, "Dependency payload is missing.");
  }
  await markAffectedReports(
    db,
    payload.dependencyType as "RULE" | "SOURCE" | "BENCHMARK" | "CONFIRMED_REVISION",
    payload.dependencyId
  );
  return "COMPLETED";
}

export async function assertJobSubjectVersion(
  db: Kysely<Database>,
  job: Selectable<JobsTable>
): Promise<void> {
  const document = await loadDocument(db, job);
  if (!document || document.version !== job.subject_version) {
    throw conflict("The subject changed or was deleted.", "DOMAIN_STATE_CONFLICT");
  }
  if (!document) throw notFound();
}
