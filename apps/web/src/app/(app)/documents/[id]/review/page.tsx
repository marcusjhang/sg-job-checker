import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb, tenantDb } from "@job-checker/db";
import { requirePageActor } from "@/lib/auth";
import { ReviewForm } from "@/components/review-form";
import { decryptString } from "@job-checker/documents";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const tenant = tenantDb(getDb(), actor.userId);
  let document;
  try {
    document = await tenant.document(id);
  } catch {
    notFound();
  }
  if (document.state === "DELETION_PENDING" || document.state === "DELETED") redirect("/reports");
  if (document.state === "READY" || document.state === "GENERATED") {
    redirect(`/documents/${id}/occupation`);
  }

  const latestRevision = await getDb()
    .selectFrom("extraction_revisions")
    .selectAll()
    .where("document_id", "=", id)
    .where("user_id", "=", actor.userId)
    .orderBy("revision", "desc")
    .limit(1)
    .executeTakeFirst();

  const fields = latestRevision
    ? await getDb()
        .selectFrom("extracted_fields")
        .selectAll()
        .where("extraction_revision_id", "=", latestRevision.id)
        .where("user_id", "=", actor.userId)
        .execute()
    : [];

  return (
    <div className="wrap" style={{ maxWidth: 980 }}>
      <p className="eyebrow">Step 2 · Confirm facts</p>
      <h1 style={{ fontSize: 38 }}>Review every critical field</h1>
      <p className="lede">
        Extraction is a proposal, not a fact. Accept, edit, or (where allowed) confirm absent each
        critical field. Nothing below is checked for you.
      </p>
      <div className="banner info">
        Document type: <strong>{document.kind === "OFFER" ? "Offer" : "Contract"}</strong>. Source:{" "}
        {document.origin === "MANUAL" ? "manual entry" : "uploaded document"}.
        {latestRevision ? ` Extraction revision ${latestRevision.revision}.` : ""}
      </div>
      <ReviewForm
        documentId={id}
        documentKind={document.kind}
        state={document.state}
        extractionRevisionId={latestRevision?.id ?? null}
        extracted={fields.map((field) => ({
          fieldKey: field.field_key,
          value: field.value,
          status: field.status,
          confidence: field.confidence === null ? null : Number(field.confidence),
          page: field.page_number,
          sourceSpan: decryptString(field.source_span_ciphertext)
        }))}
      />
      <p className="small muted" style={{ marginTop: 20 }}>
        <Link href="/reports">Cancel and return to reports</Link>
      </p>
    </div>
  );
}
