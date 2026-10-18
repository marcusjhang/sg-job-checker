import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@job-checker/db";
import { enqueueJob } from "@job-checker/db";
import type { Actor } from "@job-checker/identity";
import { AppError, conflict, notFound } from "@job-checker/contracts";
import { env } from "@job-checker/observability/env";
import { recordAudit } from "@job-checker/audit";
import { encryptString, sha256Hex } from "./crypto";
import { objectStore } from "./storage";
import {
  assertContentMatchesType,
  validateUploadMetadata,
  type AllowedMediaType
} from "./file-policy";
import { assertKnownKind, requireCurrentAcceptance } from "./policy-acceptance";

const INTENT_TTL_MS = 5 * 60 * 1000;

function signIntent(intentId: string, expiresAtMs: number): string {
  return createHmac("sha256", env().SESSION_SECRET)
    .update(`upload:${intentId}:${expiresAtMs}`)
    .digest("base64url");
}

function verifyIntentToken(intentId: string, token: string): number | null {
  const [tokenId, expRaw, signature] = token.split(".");
  if (!tokenId || !expRaw || !signature || tokenId !== intentId) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return null;
  const expected = signIntent(tokenId, exp);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  if (exp <= Date.now()) return null;
  return exp;
}

function extensionFor(contentType: AllowedMediaType): string {
  if (contentType === "application/pdf") return ".pdf";
  if (contentType === "image/jpeg") return ".jpg";
  return ".png";
}

export type UploadIntentCommand = {
  operationKey: string;
  policyAcceptanceId: string;
  kind: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256?: string;
};

export type UploadIntentResult = {
  intentId: string;
  documentId: string;
  uploadToken: string;
  uploadUrl: string;
  expiresAt: string;
};

export async function createUploadIntent(
  db: Kysely<Database>,
  actor: Actor,
  command: UploadIntentCommand
): Promise<UploadIntentResult> {
  validateUploadMetadata(command);
  await requireCurrentAcceptance(db, actor.userId, command.policyAcceptanceId);

  const existing = await db
    .selectFrom("upload_intents")
    .select(["id", "document_id", "expires_at"])
    .where("user_id", "=", actor.userId)
    .where("operation_key", "=", command.operationKey)
    .executeTakeFirst();
  if (existing) {
    return {
      intentId: existing.id,
      documentId: existing.document_id,
      uploadToken: `${existing.id}.${existing.expires_at.valueOf()}.${signIntent(existing.id, existing.expires_at.valueOf())}`,
      uploadUrl: `/api/uploads/${existing.id}/put`,
      expiresAt: existing.expires_at.toISOString()
    };
  }

  const intentId = randomUUID();
  const documentId = randomUUID();
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
  const contentType = command.contentType.toLowerCase() as AllowedMediaType;
  const objectKey = `users/${actor.userId}/documents/${documentId}/original${extensionFor(contentType)}`;

  await db
    .insertInto("upload_intents")
    .values({
      id: intentId,
      user_id: actor.userId,
      operation_key: command.operationKey,
      document_id: documentId,
      kind: assertKnownKind(command.kind),
      policy_acceptance_id: command.policyAcceptanceId,
      original_name_ciphertext: encryptString(command.fileName),
      object_key: objectKey,
      content_type: contentType,
      declared_bytes: String(command.byteSize),
      expected_sha256: command.sha256 ?? null,
      expires_at: expiresAt
    })
    .execute();

  await recordAudit(db, {
    userId: actor.userId,
    actorType: "USER",
    actorId: actor.userId,
    action: "upload.intent.create",
    subjectType: "upload_intent",
    subjectId: intentId,
    result: "SUCCESS",
    metadata: { kind: command.kind, contentType }
  });

  return {
    intentId,
    documentId,
    uploadToken: `${intentId}.${expiresAt.valueOf()}.${signIntent(intentId, expiresAt.valueOf())}`,
    uploadUrl: `/api/uploads/${intentId}/put`,
    expiresAt: expiresAt.toISOString()
  };
}

export async function putUploadObject(
  db: Kysely<Database>,
  intentId: string,
  token: string,
  bytes: Buffer
): Promise<{ sha256: string }> {
  const expiresAt = verifyIntentToken(intentId, token);
  if (expiresAt === null) {
    throw new AppError("UPLOAD_INVALID", 422, "This upload link is invalid or has expired.");
  }
  const row = await db
    .selectFrom("upload_intents")
    .selectAll()
    .where("id", "=", intentId)
    .executeTakeFirst();
  if (!row) throw notFound();
  if (row.consumed_at)
    throw conflict("This upload link has already been used.", "DOMAIN_STATE_CONFLICT");
  if (row.object_written_at)
    throw conflict("This upload already has an object.", "DOMAIN_STATE_CONFLICT");
  if (row.expires_at.valueOf() <= Date.now()) {
    throw new AppError("UPLOAD_INVALID", 422, "This upload link has expired.");
  }
  if (bytes.length !== Number(row.declared_bytes)) {
    throw new AppError(
      "UPLOAD_INVALID",
      422,
      "The uploaded size does not match the declared size."
    );
  }
  const contentType = row.content_type as AllowedMediaType;
  assertContentMatchesType(bytes, contentType);
  const digest = sha256Hex(bytes);
  if (row.expected_sha256 && row.expected_sha256.toLowerCase() !== digest) {
    throw new AppError("UPLOAD_INVALID", 422, "The uploaded checksum does not match.");
  }

  await objectStore().put(row.object_key, bytes, contentType);
  const updated = await db
    .updateTable("upload_intents")
    .set({ object_written_at: new Date(), actual_sha256: digest })
    .where("id", "=", intentId)
    .where("object_written_at", "is", null)
    .where("consumed_at", "is", null)
    .returning("id")
    .executeTakeFirst();
  if (!updated) {
    await objectStore().delete(row.object_key);
    throw conflict("This upload link has already been used.", "DOMAIN_STATE_CONFLICT");
  }
  return { sha256: digest };
}

export type CompleteUploadCommand = { intentId: string; operationKey: string };

export async function completeUpload(
  db: Kysely<Database>,
  actor: Actor,
  command: CompleteUploadCommand
): Promise<{ documentId: string }> {
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("documents")
      .select("id")
      .where("user_id", "=", actor.userId)
      .where("operation_key", "=", command.operationKey)
      .executeTakeFirst();
    if (existing) return { documentId: existing.id };

    const intent = await trx
      .selectFrom("upload_intents")
      .selectAll()
      .where("id", "=", command.intentId)
      .where("user_id", "=", actor.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!intent) throw notFound();
    if (intent.consumed_at) {
      const doc = await trx
        .selectFrom("documents")
        .select("id")
        .where("user_id", "=", actor.userId)
        .where("operation_key", "=", command.operationKey)
        .executeTakeFirst();
      if (doc) return { documentId: doc.id };
      throw conflict("This upload has already been completed.", "IDEMPOTENCY_CONFLICT");
    }
    if (!intent.object_written_at || !intent.actual_sha256) {
      throw conflict("Upload the file before completing it.", "DOMAIN_STATE_CONFLICT");
    }
    if (intent.expires_at.valueOf() <= Date.now()) {
      throw new AppError("UPLOAD_INVALID", 422, "This upload link has expired.");
    }
    const head = await objectStore().head(intent.object_key);
    if (!head || head.size === 0) {
      throw new AppError("UPLOAD_INVALID", 422, "The uploaded object is missing.");
    }

    const documentId = intent.document_id;
    await requireCurrentAcceptance(trx, actor.userId, intent.policy_acceptance_id);

    await trx
      .insertInto("documents")
      .values({
        id: documentId,
        user_id: actor.userId,
        kind: intent.kind,
        state: "UPLOADED",
        version: "1",
        original_name_ciphertext: intent.original_name_ciphertext,
        media_type: intent.content_type,
        byte_size: intent.declared_bytes,
        sha256: intent.actual_sha256,
        object_key: intent.object_key,
        policy_acceptance_id: intent.policy_acceptance_id,
        operation_key: command.operationKey,
        origin: "UPLOAD",
        retention_expires_at: new Date(Date.now() + env().ABANDONED_RETENTION_DAYS * 86_400_000),
        updated_at: new Date()
      })
      .execute();

    await trx
      .updateTable("upload_intents")
      .set({ consumed_at: new Date() })
      .where("id", "=", intent.id)
      .execute();

    await enqueueJob(trx, {
      userId: actor.userId,
      kind: "SCAN_DOCUMENT",
      subjectId: documentId,
      subjectVersion: 1,
      occurrenceKey: randomUUID(),
      payload: { documentVersion: 1 },
      maxAttempts: 3
    });

    await recordAudit(trx, {
      userId: actor.userId,
      actorType: "USER",
      actorId: actor.userId,
      action: "upload.complete",
      subjectType: "document",
      subjectId: documentId,
      result: "SUCCESS"
    });

    return { documentId };
  });
}

export type ManualDocumentCommand = {
  kind: string;
  policyAcceptanceId: string;
  operationKey: string;
};

export async function createManualDocument(
  db: Kysely<Database>,
  actor: Actor,
  command: ManualDocumentCommand
): Promise<{ documentId: string }> {
  const kind = assertKnownKind(command.kind);
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("documents")
      .select("id")
      .where("user_id", "=", actor.userId)
      .where("operation_key", "=", command.operationKey)
      .executeTakeFirst();
    if (existing) return { documentId: existing.id };

    await requireCurrentAcceptance(trx, actor.userId, command.policyAcceptanceId);

    const inserted = await trx
      .insertInto("documents")
      .values({
        user_id: actor.userId,
        kind,
        state: "USER_REVIEW",
        version: "1",
        policy_acceptance_id: command.policyAcceptanceId,
        operation_key: command.operationKey,
        origin: "MANUAL",
        retention_expires_at: new Date(Date.now() + env().ABANDONED_RETENTION_DAYS * 86_400_000),
        updated_at: new Date()
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await recordAudit(trx, {
      userId: actor.userId,
      actorType: "USER",
      actorId: actor.userId,
      action: "document.create.manual",
      subjectType: "document",
      subjectId: inserted.id,
      result: "SUCCESS",
      metadata: { kind }
    });

    return { documentId: inserted.id };
  });
}

export async function cleanupOrphanUploads(db: Kysely<Database>): Promise<number> {
  const rows = await db
    .selectFrom("upload_intents")
    .select(["id", "object_key", "consumed_at", "expires_at"])
    .where("consumed_at", "is", null)
    .where("expires_at", "<", new Date())
    .execute();
  let removed = 0;
  for (const row of rows) {
    const document = await db
      .selectFrom("documents")
      .select("id")
      .where("object_key", "=", row.object_key)
      .executeTakeFirst();
    if (!document) {
      await objectStore().delete(row.object_key);
      await db.deleteFrom("upload_intents").where("id", "=", row.id).execute();
      removed += 1;
    }
  }
  return removed;
}
