import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import {
  createDb,
  createTestDatabase,
  leaseJobs,
  type Database,
  type TestDatabase
} from "@job-checker/db";
import { getOrCreateUser, type Actor } from "@job-checker/identity";
import {
  acceptPolicy,
  completeUpload,
  createUploadIntent,
  currentPolicy,
  executeDeletion,
  putUploadObject,
  requestDeletion,
  sha256Hex
} from "@job-checker/documents";

let testDb: TestDatabase;
let db: Kysely<Database>;
let actor: Actor;

beforeAll(async () => {
  testDb = await createTestDatabase();
  db = createDb(testDb.url);
  actor = await getOrCreateUser(db, "upload@example.com", "Upload", false);
});

afterAll(async () => {
  if (db) await db.destroy();
  if (testDb) await testDb.drop();
});

async function acceptance(): Promise<string> {
  const policy = await currentPolicy(db);
  return (await acceptPolicy(db, actor, policy.id)).acceptanceId;
}

function cleanPdf(): Buffer {
  return Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "latin1");
}

describe("private upload lifecycle", () => {
  it("creates a single-use intent, writes the exact object, and enqueues one scan", async () => {
    const policyAcceptanceId = await acceptance();
    const bytes = cleanPdf();
    const operationKey = randomUUID();
    const intent = await createUploadIntent(db, actor, {
      operationKey,
      policyAcceptanceId,
      kind: "OFFER",
      fileName: "offer.pdf",
      contentType: "application/pdf",
      byteSize: bytes.length,
      sha256: sha256Hex(bytes)
    });
    await putUploadObject(db, intent.intentId, intent.uploadToken, bytes);
    await expect(putUploadObject(db, intent.intentId, intent.uploadToken, bytes)).rejects.toThrow();
    const completed = await completeUpload(db, actor, { intentId: intent.intentId, operationKey });
    expect(completed.documentId).toBe(intent.documentId);
    const duplicate = await completeUpload(db, actor, { intentId: intent.intentId, operationKey });
    expect(duplicate.documentId).toBe(intent.documentId);

    const document = await db
      .selectFrom("documents")
      .select(["state", "origin", "object_key", "policy_acceptance_id"])
      .where("id", "=", intent.documentId)
      .executeTakeFirst();
    expect(document?.state).toBe("UPLOADED");
    expect(document?.origin).toBe("UPLOAD");
    expect(document?.policy_acceptance_id).toBe(policyAcceptanceId);
    expect(document?.object_key).toContain(actor.userId);

    const jobs = await db
      .selectFrom("jobs")
      .select(["kind", "state"])
      .where("subject_id", "=", intent.documentId)
      .execute();
    expect(jobs).toEqual([{ kind: "SCAN_DOCUMENT", state: "PENDING" }]);
  });

  it("rejects a checksum mismatch and a reused intent token", async () => {
    const policyAcceptanceId = await acceptance();
    const bytes = cleanPdf();
    const intent = await createUploadIntent(db, actor, {
      operationKey: randomUUID(),
      policyAcceptanceId,
      kind: "OFFER",
      fileName: "offer.pdf",
      contentType: "application/pdf",
      byteSize: bytes.length,
      sha256: "0".repeat(64)
    });
    await expect(putUploadObject(db, intent.intentId, intent.uploadToken, bytes)).rejects.toThrow(
      /checksum/i
    );
  });
});

describe("deletion", () => {
  it("revokes access, cancels jobs, erases content, and leaves a non-sensitive receipt", async () => {
    const policyAcceptanceId = await acceptance();
    const bytes = cleanPdf();
    const operationKey = randomUUID();
    const intent = await createUploadIntent(db, actor, {
      operationKey,
      policyAcceptanceId,
      kind: "OFFER",
      fileName: "to-delete.pdf",
      contentType: "application/pdf",
      byteSize: bytes.length,
      sha256: sha256Hex(bytes)
    });
    await putUploadObject(db, intent.intentId, intent.uploadToken, bytes);
    const completed = await completeUpload(db, actor, { intentId: intent.intentId, operationKey });
    const deletionKey = randomUUID();
    const requested = await requestDeletion(db, actor, completed.documentId, deletionKey);
    expect(requested.state).toBe("DELETION_PENDING");

    const jobs = await leaseJobs(db, "deletion-worker", 5, ["DELETE_DOCUMENT"]);
    const job = jobs.find((item) => item.subject_id === completed.documentId);
    if (!job) throw new Error("expected deletion job");
    const result = await executeDeletion(db, job);
    expect(result).not.toBe("CANCELLED_STALE");

    const document = await db
      .selectFrom("documents")
      .select("id")
      .where("id", "=", completed.documentId)
      .executeTakeFirst();
    expect(document).toBeUndefined();
    const receipt = await db
      .selectFrom("deletion_receipts")
      .selectAll()
      .orderBy("completed_at", "desc")
      .limit(1)
      .executeTakeFirst();
    expect(receipt).toBeDefined();
    expect(JSON.stringify(receipt)).not.toContain("to-delete.pdf");
    expect(receipt?.stores_checked).toContain("object_store");
  });

  it("ignores a late deletion job when the document version changed", async () => {
    const policyAcceptanceId = await acceptance();
    const bytes = cleanPdf();
    const operationKey = randomUUID();
    const intent = await createUploadIntent(db, actor, {
      operationKey,
      policyAcceptanceId,
      kind: "CONTRACT",
      fileName: "late.pdf",
      contentType: "application/pdf",
      byteSize: bytes.length,
      sha256: sha256Hex(bytes)
    });
    await putUploadObject(db, intent.intentId, intent.uploadToken, bytes);
    const completed = await completeUpload(db, actor, { intentId: intent.intentId, operationKey });
    const request = await requestDeletion(db, actor, completed.documentId, randomUUID());
    const jobs = await leaseJobs(db, "late-worker", 5, ["DELETE_DOCUMENT"]);
    const job = jobs.find((item) => item.subject_id === completed.documentId);
    if (!job) throw new Error("expected deletion job");
    await db
      .updateTable("documents")
      .set({ version: String(Number(request.version) + 1) })
      .where("id", "=", completed.documentId)
      .execute();
    const result = await executeDeletion(db, job);
    expect(result).toBe("CANCELLED_STALE");
  });
});
