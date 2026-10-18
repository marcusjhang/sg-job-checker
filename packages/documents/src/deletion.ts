import { createHash } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { Database, DocumentRow, JobsTable } from "@job-checker/db";
import { cancelSubjectJobs, enableDeletionMode, enqueueJob } from "@job-checker/db";
import type { Actor } from "@job-checker/identity";
import { conflict, notFound } from "@job-checker/contracts";
import { env } from "@job-checker/observability/env";
import { recordAudit, hashIdentifier } from "@job-checker/audit";
import { objectStore } from "./storage";

export function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function subjectHash(subjectId: string): string {
  return hashIdentifier(`deletion:${subjectId}`);
}

export type DeletionRequestResult = {
  documentId: string;
  version: string;
  state: "DELETION_PENDING" | "DELETED";
  alreadyRequested: boolean;
};

export async function requestDeletion(
  db: Kysely<Database>,
  actor: Actor,
  documentId: string,
  operationKey: string
): Promise<DeletionRequestResult> {
  return db.transaction().execute(async (trx) => {
    const document = await trx
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", documentId)
      .where("user_id", "=", actor.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!document) throw notFound();

    if (document.state === "DELETED") {
      return { documentId, version: document.version, state: "DELETED", alreadyRequested: true };
    }
    if (document.state === "DELETION_PENDING") {
      await enqueueJob(trx, {
        userId: actor.userId,
        kind: "DELETE_DOCUMENT",
        subjectId: documentId,
        subjectVersion: document.version,
        occurrenceKey: operationKey,
        payload: { documentVersion: document.version }
      });
      return {
        documentId,
        version: document.version,
        state: "DELETION_PENDING",
        alreadyRequested: true
      };
    }

    const nextVersion = String(Number(document.version) + 1);
    await trx
      .updateTable("documents")
      .set({
        state: "DELETION_PENDING",
        version: nextVersion,
        retention_expires_at: null,
        updated_at: new Date()
      })
      .where("id", "=", documentId)
      .where("user_id", "=", actor.userId)
      .where("version", "=", document.version)
      .execute();

    await trx
      .updateTable("shares")
      .set({ revoked_at: new Date() })
      .where(
        "report_id",
        "in",
        trx.selectFrom("reports").select("id").where("document_id", "=", documentId)
      )
      .where("revoked_at", "is", null)
      .execute();

    await cancelSubjectJobs(trx, actor.userId, documentId, "SUBJECT_DELETED");

    await enqueueJob(trx, {
      userId: actor.userId,
      kind: "DELETE_DOCUMENT",
      subjectId: documentId,
      subjectVersion: nextVersion,
      occurrenceKey: operationKey,
      payload: { documentVersion: nextVersion },
      maxAttempts: 5
    });

    await recordAudit(trx, {
      userId: actor.userId,
      actorType: "USER",
      actorId: actor.userId,
      action: "document.deletion.request",
      subjectType: "document",
      subjectId: documentId,
      result: "SUCCESS",
      metadata: { fromState: document.state, toState: "DELETION_PENDING" }
    });

    return {
      documentId,
      version: nextVersion,
      state: "DELETION_PENDING",
      alreadyRequested: false
    };
  });
}

async function collectObjectKeys(trx: Kysely<Database>, document: DocumentRow): Promise<string[]> {
  const keys = new Set<string>();
  if (document.object_key) keys.add(document.object_key);
  const pages = await trx
    .selectFrom("document_pages")
    .select("image_object_key")
    .where("document_id", "=", document.id)
    .where("image_object_key", "is not", null)
    .execute();
  for (const page of pages) {
    if (page.image_object_key) keys.add(page.image_object_key);
  }
  return [...keys];
}

export type DeletionReceiptResult = {
  receiptId: string;
  storesChecked: string[];
  completedAt: Date;
};

export async function executeDeletion(
  db: Kysely<Database>,
  job: Selectable<JobsTable>
): Promise<DeletionReceiptResult | "CANCELLED_STALE"> {
  return db.transaction().execute(async (trx) => {
    await enableDeletionMode(trx);
    const document = await trx
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", job.subject_id)
      .forUpdate()
      .executeTakeFirst();

    if (
      !document ||
      document.state !== "DELETION_PENDING" ||
      document.version !== job.subject_version
    ) {
      return "CANCELLED_STALE" as const;
    }

    const keys = await collectObjectKeys(trx, document);
    for (const key of keys) {
      await objectStore().delete(key);
    }

    const receipt = await trx
      .insertInto("deletion_receipts")
      .values({
        subject_hash: subjectHash(document.id),
        requested_at: document.updated_at,
        completed_at: new Date(),
        stores_checked: ["object_store", "postgres", "shares", "jobs"],
        outstanding_expiry: new Date(Date.now() + 30 * 86_400_000),
        detail: JSON.stringify({
          objectsChecked: keys.length,
          backupWindowDays: 30,
          providerWindow: "none in Phase 1A"
        })
      })
      .returning(["id", "completed_at", "stores_checked"])
      .executeTakeFirstOrThrow();

    const reportIds = trx.selectFrom("reports").select("id").where("document_id", "=", document.id);
    const revisionIds = trx
      .selectFrom("confirmed_revisions")
      .select("id")
      .where("document_id", "=", document.id);
    await trx.deleteFrom("shares").where("report_id", "in", reportIds).execute();
    await trx.deleteFrom("report_dependencies").where("report_id", "in", reportIds).execute();
    await trx.deleteFrom("evidence").where("report_id", "in", reportIds).execute();
    await trx.deleteFrom("reports").where("document_id", "=", document.id).execute();
    await trx.deleteFrom("generation_requests").where("document_id", "=", document.id).execute();
    await trx
      .deleteFrom("occupation_matches")
      .where("confirmed_revision_id", "in", revisionIds)
      .execute();
    await trx.deleteFrom("confirmed_revisions").where("document_id", "=", document.id).execute();
    await trx
      .deleteFrom("extracted_fields")
      .where(
        "extraction_revision_id",
        "in",
        trx.selectFrom("extraction_revisions").select("id").where("document_id", "=", document.id)
      )
      .execute();
    await trx.deleteFrom("extraction_revisions").where("document_id", "=", document.id).execute();
    await trx.deleteFrom("document_pages").where("document_id", "=", document.id).execute();
    await trx.deleteFrom("scan_findings").where("document_id", "=", document.id).execute();
    await trx.deleteFrom("upload_intents").where("document_id", "=", document.id).execute();
    await trx.deleteFrom("documents").where("id", "=", document.id).execute();

    await recordAudit(trx, {
      userId: job.user_id,
      actorType: "WORKER",
      action: "document.deletion.complete",
      subjectType: "deletion_receipt",
      subjectId: receipt.id,
      result: "SUCCESS"
    });

    return {
      receiptId: receipt.id,
      storesChecked: receipt.stores_checked,
      completedAt: receipt.completed_at
    };
  });
}

export async function purgeRawArtefacts(
  db: Kysely<Database>,
  documentId: string,
  expectedVersion: string
): Promise<"PURGED" | "CANCELLED_STALE"> {
  return db.transaction().execute(async (trx) => {
    await enableDeletionMode(trx);
    const document = await trx
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", documentId)
      .forUpdate()
      .executeTakeFirst();
    if (
      !document ||
      document.version !== expectedVersion ||
      ["DELETION_PENDING", "DELETED"].includes(document.state)
    ) {
      return "CANCELLED_STALE" as const;
    }
    const keys = await collectObjectKeys(trx, document);
    for (const key of keys) {
      await objectStore().delete(key);
    }
    await trx.deleteFrom("document_pages").where("document_id", "=", documentId).execute();
    await trx
      .updateTable("extracted_fields")
      .set({ source_span_ciphertext: null })
      .where("user_id", "=", document.user_id)
      .where(
        "extraction_revision_id",
        "in",
        trx.selectFrom("extraction_revisions").select("id").where("document_id", "=", documentId)
      )
      .execute();
    await trx
      .updateTable("documents")
      .set({ updated_at: new Date() })
      .where("id", "=", documentId)
      .execute();
    return "PURGED" as const;
  });
}

export async function expireRetention(db: Kysely<Database>): Promise<number> {
  const due = await db
    .selectFrom("documents")
    .select(["id", "user_id", "version", "retention_expires_at"])
    .where("retention_expires_at", "<", new Date())
    .where("state", "not in", ["DELETION_PENDING", "DELETED"])
    .execute();
  let count = 0;
  for (const document of due) {
    const system: Actor = {
      userId: document.user_id,
      authSubject: "retention-scheduler",
      displayName: null,
      isStaff: false
    };
    await requestDeletion(
      db,
      system,
      document.id,
      deterministicUuid(`retention:${document.id}:${document.version}`)
    );
    count += 1;
  }
  return count;
}

export async function createShare(
  db: Kysely<Database>,
  actor: Actor,
  reportId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<{ shareId: string }> {
  const report = await db
    .selectFrom("reports")
    .select("id")
    .where("id", "=", reportId)
    .where("user_id", "=", actor.userId)
    .executeTakeFirst();
  if (!report) throw notFound();
  const inserted = await db
    .insertInto("shares")
    .values({
      user_id: actor.userId,
      report_id: reportId,
      token_hash: tokenHash,
      expires_at: expiresAt
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { shareId: inserted.id };
}

export async function revokeShare(
  db: Kysely<Database>,
  actor: Actor,
  shareId: string
): Promise<void> {
  const updated = await db
    .updateTable("shares")
    .set({ revoked_at: new Date() })
    .where("id", "=", shareId)
    .where("user_id", "=", actor.userId)
    .where("revoked_at", "is", null)
    .returning("id")
    .executeTakeFirst();
  if (!updated) throw notFound();
}

export function shareExpiry(days = env().SHARE_TTL_DAYS): Date {
  return new Date(Date.now() + days * 86_400_000);
}

export function assertSameDocument(a: string, b: string): void {
  if (a !== b) throw conflict("Document mismatch", "DOMAIN_STATE_CONFLICT");
}
