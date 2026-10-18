import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb, tenantDb } from "@job-checker/db";
import { requireUser } from "@job-checker/identity";
import { staffEmails } from "@job-checker/observability/env";
import { decryptString } from "@job-checker/documents";
import { errorResponse, jsonResponse } from "@/lib/api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; revision: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    const actor = await requireUser(request, getDb(), staffEmails());
    const { id, revision } = await context.params;
    const document = await tenantDb(getDb(), actor.userId).document(id);
    const rows = await getDb()
      .selectFrom("extraction_revisions")
      .innerJoin(
        "extracted_fields",
        "extracted_fields.extraction_revision_id",
        "extraction_revisions.id"
      )
      .select([
        "extraction_revisions.id as revision_id",
        "extraction_revisions.revision as revision",
        "extraction_revisions.created_at as created_at",
        "extracted_fields.field_key as field_key",
        "extracted_fields.value as value",
        "extracted_fields.status as status",
        "extracted_fields.confidence as confidence",
        "extracted_fields.page_number as page_number",
        "extracted_fields.source_span_ciphertext as source_span"
      ])
      .where("extraction_revisions.document_id", "=", id)
      .where("extraction_revisions.user_id", "=", actor.userId)
      .where("extraction_revisions.revision", "=", Number(revision))
      .execute();
    return jsonResponse({
      document: {
        id: document.id,
        kind: document.kind,
        state: document.state,
        version: document.version
      },
      revision: rows[0]?.revision ?? Number(revision),
      revisionId: rows[0]?.revision_id ?? null,
      fields: rows.map((row) => ({
        fieldKey: row.field_key,
        value: row.value,
        status: row.status,
        confidence: row.confidence === null ? null : Number(row.confidence),
        page: row.page_number,
        sourceSpan: decryptString(row.source_span)
      }))
    });
  } catch (error) {
    return errorResponse(error, correlationId, "extraction.get");
  }
}
