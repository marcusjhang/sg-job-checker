import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@job-checker/db";
import { AppError, conflict, notFound } from "@job-checker/contracts";
import { recordAudit } from "@job-checker/audit";
import { encryptString, sha256Hex } from "@job-checker/documents";
import { env } from "@job-checker/observability/env";
import { normalizeProposedFieldSet } from "./normalize";
import { createExtractionProvider, pageArtefactsFromPdf } from "./local";
import type { PageArtefact, ProposedFieldSet } from "./provider";
import { EXTRACTION_SCHEMA_VERSION } from "./provider";

const MAX_PAGES = 40;

export type ExtractionCommit = {
  revisionId: string;
  revision: number;
  state: "USER_REVIEW" | "NEEDS_INPUT";
};

export async function persistExtractionRevision(
  trx: Kysely<Database>,
  input: {
    userId: string;
    documentId: string;
    documentVersion: string;
    pages: PageArtefact[];
    proposed: ProposedFieldSet;
  }
): Promise<ExtractionCommit> {
  const document = await trx
    .selectFrom("documents")
    .selectAll()
    .where("id", "=", input.documentId)
    .where("user_id", "=", input.userId)
    .forUpdate()
    .executeTakeFirst();
  if (!document) throw notFound();
  if (document.version !== input.documentVersion) {
    throw conflict("The document changed while extraction was running.", "DOMAIN_STATE_CONFLICT");
  }
  if (document.state !== "SCANNING") {
    throw conflict("The document is not in a scan/extract state.", "DOMAIN_STATE_CONFLICT");
  }

  const latest = await trx
    .selectFrom("extraction_revisions")
    .select("revision")
    .where("document_id", "=", input.documentId)
    .orderBy("revision", "desc")
    .limit(1)
    .executeTakeFirst();
  const revision = (latest?.revision ?? 0) + 1;

  for (const page of input.pages) {
    await trx
      .insertInto("document_pages")
      .values({
        user_id: input.userId,
        document_id: input.documentId,
        document_version: input.documentVersion,
        page_number: page.pageNumber,
        text_ciphertext: encryptString(page.text),
        image_object_key: page.imageObjectKey ?? null,
        sha256: page.sha256
      })
      .onConflict((oc) =>
        oc.columns(["document_id", "document_version", "page_number"]).doNothing()
      )
      .execute();
  }

  const insertedRevision = await trx
    .insertInto("extraction_revisions")
    .values({
      user_id: input.userId,
      document_id: input.documentId,
      document_version: input.documentVersion,
      revision,
      schema_version: EXTRACTION_SCHEMA_VERSION,
      provider_metadata: JSON.stringify({
        provider: input.proposed.provider,
        redaction: input.proposed.redaction
      })
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  for (const field of input.proposed.fields) {
    await trx
      .insertInto("extracted_fields")
      .values({
        user_id: input.userId,
        extraction_revision_id: insertedRevision.id,
        field_key: field.fieldKey,
        value: field.status === "PRESENT" ? JSON.stringify(field.value) : null,
        status: field.status,
        confidence: field.confidence === null ? null : String(field.confidence),
        page_number: field.pageNumber ?? null,
        source_span_ciphertext: field.sourceSpan ? encryptString(field.sourceSpan) : null
      })
      .execute();
  }

  const hasUsable = input.proposed.fields.some((field) => field.status === "PRESENT");
  const nextState = hasUsable ? "USER_REVIEW" : "NEEDS_INPUT";

  await trx
    .updateTable("documents")
    .set({ state: "EXTRACTED", updated_at: new Date() })
    .where("id", "=", input.documentId)
    .where("version", "=", input.documentVersion)
    .execute();
  await trx
    .updateTable("documents")
    .set({
      state: nextState,
      updated_at: new Date(),
      retention_expires_at: new Date(Date.now() + env().ABANDONED_RETENTION_DAYS * 86_400_000)
    })
    .where("id", "=", input.documentId)
    .where("version", "=", input.documentVersion)
    .execute();

  await recordAudit(trx, {
    userId: input.userId,
    actorType: "WORKER",
    action: "extraction.revision.create",
    subjectType: "document",
    subjectId: input.documentId,
    result: "SUCCESS",
    metadata: { revision, state: nextState }
  });

  return { revisionId: insertedRevision.id, revision, state: nextState };
}

export async function extractDocument(
  trx: Kysely<Database>,
  input: {
    userId: string;
    documentId: string;
    documentVersion: string;
    bytes: Buffer;
    mediaType: string;
  }
): Promise<ExtractionCommit> {
  if (input.mediaType !== "application/pdf") {
    throw new AppError(
      "EXTRACTION_FAILED",
      422,
      "Image OCR is not enabled in Phase 1A. Enter the facts manually or upload a text PDF."
    );
  }
  const rawPages = await pageArtefactsFromPdf(input.bytes);
  if (rawPages.length > MAX_PAGES) {
    throw new AppError("DOCUMENT_UNSAFE", 422, "The document exceeds the 40-page limit.");
  }
  const hasText = rawPages.some((page) => page.text.trim().length > 20);
  if (!hasText) {
    throw new AppError(
      "EXTRACTION_FAILED",
      422,
      "No selectable text was found. Enter the facts manually or upload a text-based PDF."
    );
  }
  const pages: PageArtefact[] = rawPages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text,
    sha256: sha256Hex(page.text)
  }));
  const provider = createExtractionProvider();
  const proposed = await provider.extract(pages, []);
  const normalized = normalizeProposedFieldSet(proposed, pages);
  return persistExtractionRevision(trx, {
    userId: input.userId,
    documentId: input.documentId,
    documentVersion: input.documentVersion,
    pages,
    proposed: normalized
  });
}

export async function reviseExtraction(
  trx: Kysely<Database>,
  input: {
    userId: string;
    extractionRevisionId: string;
    edits: Array<{ fieldKey: string; value: unknown; status: "PRESENT" | "ABSENT" | "UNCERTAIN" }>;
  }
): Promise<{ revisionId: string; revision: number }> {
  const original = await trx
    .selectFrom("extraction_revisions")
    .selectAll()
    .where("id", "=", input.extractionRevisionId)
    .where("user_id", "=", input.userId)
    .executeTakeFirst();
  if (!original) throw notFound();
  const fields = await trx
    .selectFrom("extracted_fields")
    .selectAll()
    .where("extraction_revision_id", "=", original.id)
    .execute();
  const latest = await trx
    .selectFrom("extraction_revisions")
    .select("revision")
    .where("document_id", "=", original.document_id)
    .orderBy("revision", "desc")
    .limit(1)
    .executeTakeFirst();
  const revision = (latest?.revision ?? 0) + 1;
  const inserted = await trx
    .insertInto("extraction_revisions")
    .values({
      user_id: input.userId,
      document_id: original.document_id,
      document_version: original.document_version,
      revision,
      schema_version: original.schema_version,
      provider_metadata: JSON.stringify({ provider: { name: "user-revision" } })
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  for (const field of fields) {
    const edit = input.edits.find((item) => item.fieldKey === field.field_key);
    await trx
      .insertInto("extracted_fields")
      .values({
        user_id: input.userId,
        extraction_revision_id: inserted.id,
        field_key: field.field_key,
        value: edit ? JSON.stringify(edit.value) : JSON.stringify(field.value),
        status: edit?.status ?? field.status,
        confidence: edit ? null : field.confidence,
        page_number: field.page_number,
        source_span_ciphertext: edit ? null : field.source_span_ciphertext
      })
      .execute();
  }
  return { revisionId: inserted.id, revision };
}

export function newOccurrenceKey(): string {
  return randomUUID();
}
