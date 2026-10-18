import type { Kysely } from "kysely";
import type { Database } from "@job-checker/db";
import type { Actor } from "@job-checker/identity";
import {
  ConfirmedEmploymentFactsV1Schema,
  conflict,
  hashFacts,
  notFound,
  validateForConfirmation,
  validationFailed,
  criticalFieldKeys,
  hashFieldValue,
  getFieldValue,
  type ConfirmationManifest,
  type ConfirmedEmploymentFactsV1
} from "@job-checker/contracts";
import { recordAudit } from "@job-checker/audit";

export type ConfirmFactsCommand = {
  extractionRevisionId?: string;
  facts: unknown;
  confirmedFields: string[];
  absentFields: string[];
};

export type ConfirmFactsResult = { confirmedRevisionId: string; revision: number };

export async function confirmFacts(
  db: Kysely<Database>,
  actor: Actor,
  documentId: string,
  command: ConfirmFactsCommand
): Promise<ConfirmFactsResult> {
  const parsed = ConfirmedEmploymentFactsV1Schema.safeParse(command.facts);
  if (!parsed.success) {
    throw validationFailed(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "facts",
        message: issue.message
      }))
    );
  }
  const facts = parsed.data as ConfirmedEmploymentFactsV1;
  const confirmed = new Set(command.confirmedFields);
  const absent = new Set(command.absentFields);
  const manifestFields: ConfirmationManifest["fields"] = [];
  for (const key of criticalFieldKeys(facts)) {
    if (confirmed.has(key) && absent.has(key)) {
      throw validationFailed([
        { field: key, message: "A field cannot be both confirmed and confirmed absent." }
      ]);
    }
    if (confirmed.has(key)) {
      manifestFields.push({
        key,
        action: "ACCEPT",
        valueHash: hashFieldValue(getFieldValue(facts, key))
      });
    } else if (absent.has(key)) {
      manifestFields.push({
        key,
        action: "CONFIRM_ABSENT",
        valueHash: hashFieldValue(getFieldValue(facts, key))
      });
    }
  }
  const manifest: ConfirmationManifest = { fields: manifestFields };
  if (command.extractionRevisionId) manifest.extractionRevisionId = command.extractionRevisionId;
  const issues = validateForConfirmation(facts, manifest);
  if (issues.length > 0) throw validationFailed(issues);

  return db.transaction().execute(async (trx) => {
    const document = await trx
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", documentId)
      .where("user_id", "=", actor.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!document) throw notFound();
    if (document.state === "DELETION_PENDING" || document.state === "DELETED") {
      throw conflict("This document is being deleted.", "DOMAIN_STATE_CONFLICT");
    }

    if (command.extractionRevisionId) {
      const extraction = await trx
        .selectFrom("extraction_revisions")
        .select(["id", "document_id"])
        .where("id", "=", command.extractionRevisionId)
        .where("user_id", "=", actor.userId)
        .executeTakeFirst();
      if (!extraction || extraction.document_id !== documentId) throw notFound();
      const latest = await trx
        .selectFrom("extraction_revisions")
        .select("id")
        .where("document_id", "=", documentId)
        .orderBy("revision", "desc")
        .limit(1)
        .executeTakeFirst();
      if (latest?.id !== extraction.id) {
        throw conflict(
          "A newer extraction exists. Review the latest version.",
          "DOMAIN_STATE_CONFLICT"
        );
      }
    }

    const latestRevision = await trx
      .selectFrom("confirmed_revisions")
      .select("revision")
      .where("document_id", "=", documentId)
      .orderBy("revision", "desc")
      .limit(1)
      .executeTakeFirst();
    const revision = (latestRevision?.revision ?? 0) + 1;
    const hash = hashFacts(facts);

    await trx
      .updateTable("reports")
      .set({ status: "SUPERSEDED", superseded_at: new Date() })
      .where("document_id", "=", documentId)
      .where("user_id", "=", actor.userId)
      .where("status", "=", "GENERATED")
      .execute();

    const inserted = await trx
      .insertInto("confirmed_revisions")
      .values({
        user_id: actor.userId,
        document_id: documentId,
        extraction_revision_id: command.extractionRevisionId ?? null,
        revision,
        facts: JSON.stringify(facts),
        facts_schema_version: "employment-v1",
        facts_sha256: hash,
        confirmation_manifest: JSON.stringify(manifest)
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    if (document.state === "NEEDS_INPUT") {
      await trx
        .updateTable("documents")
        .set({ state: "USER_REVIEW", updated_at: new Date() })
        .where("id", "=", documentId)
        .execute();
    }
    if (document.state !== "READY") {
      await trx
        .updateTable("documents")
        .set({ state: "READY", updated_at: new Date() })
        .where("id", "=", documentId)
        .where("version", "=", document.version)
        .execute();
    } else {
      await trx
        .updateTable("documents")
        .set({ updated_at: new Date() })
        .where("id", "=", documentId)
        .execute();
    }

    await recordAudit(trx, {
      userId: actor.userId,
      actorType: "USER",
      actorId: actor.userId,
      action: "facts.confirm",
      subjectType: "confirmed_revision",
      subjectId: inserted.id,
      result: "SUCCESS",
      metadata: { revision, documentState: "READY" }
    });

    return { confirmedRevisionId: inserted.id, revision };
  });
}
