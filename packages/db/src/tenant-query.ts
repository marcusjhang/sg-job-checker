import type { Kysely, Selectable } from "kysely";
import type { Database, DocumentsTable, ReportsTable, ConfirmedRevisionsTable } from "./schema";
import { AppError, notFound } from "@job-checker/contracts";

/**
 * Tenant-scoped query helpers. Every method requires the owner and adds
 * `user_id = ?` to the predicate. Raw Kysely access outside this package is
 * allowed only in migrations, source ingestion, retention, and audited repair.
 */
export class TenantDb {
  constructor(
    private readonly db: Kysely<Database>,
    readonly userId: string
  ) {}

  documents() {
    return this.db
      .selectFrom("documents")
      .selectAll()
      .where("user_id", "=", this.userId)
      .where("state", "<>", "DELETED")
      .orderBy("created_at", "desc");
  }

  documentQuery(id: string) {
    return this.db
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", id)
      .where("user_id", "=", this.userId);
  }

  async document(id: string): Promise<Selectable<DocumentsTable>> {
    const row = await this.documentQuery(id).executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  async documentForUpdate(id: string): Promise<Selectable<DocumentsTable>> {
    const row = await this.db
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", id)
      .where("user_id", "=", this.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  reports() {
    return this.db
      .selectFrom("reports")
      .selectAll()
      .where("user_id", "=", this.userId)
      .orderBy("created_at", "desc");
  }

  async report(id: string): Promise<Selectable<ReportsTable>> {
    const row = await this.db
      .selectFrom("reports")
      .selectAll()
      .where("id", "=", id)
      .where("user_id", "=", this.userId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  async reportsForDocument(documentId: string): Promise<Selectable<ReportsTable>[]> {
    return this.db
      .selectFrom("reports")
      .selectAll()
      .where("user_id", "=", this.userId)
      .where("document_id", "=", documentId)
      .orderBy("created_at", "desc")
      .execute();
  }

  async latestConfirmedRevision(
    documentId: string
  ): Promise<Selectable<ConfirmedRevisionsTable> | undefined> {
    return this.db
      .selectFrom("confirmed_revisions")
      .selectAll()
      .where("user_id", "=", this.userId)
      .where("document_id", "=", documentId)
      .orderBy("revision", "desc")
      .limit(1)
      .executeTakeFirst();
  }

  async confirmedRevision(id: string): Promise<Selectable<ConfirmedRevisionsTable>> {
    const row = await this.db
      .selectFrom("confirmed_revisions")
      .selectAll()
      .where("id", "=", id)
      .where("user_id", "=", this.userId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  async acceptance(id: string) {
    const row = await this.db
      .selectFrom("policy_acceptances")
      .innerJoin("policy_versions", "policy_versions.id", "policy_acceptances.policy_version_id")
      .select([
        "policy_acceptances.id as id",
        "policy_acceptances.user_id as user_id",
        "policy_versions.id as policy_version_id",
        "policy_versions.policy_key as policy_key",
        "policy_versions.version as version",
        "policy_versions.content_sha256 as content_sha256",
        "policy_versions.retired_at as retired_at",
        "policy_versions.effective_from as effective_from"
      ])
      .where("policy_acceptances.id", "=", id)
      .where("policy_acceptances.user_id", "=", this.userId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  async evidenceForReport(reportId: string) {
    return this.db
      .selectFrom("evidence")
      .selectAll()
      .where("user_id", "=", this.userId)
      .where("report_id", "=", reportId)
      .orderBy("category")
      .orderBy("key")
      .execute();
  }

  async shareByHash(tokenHash: string) {
    return this.db
      .selectFrom("shares")
      .innerJoin("reports", "reports.id", "shares.report_id")
      .select([
        "shares.id as share_id",
        "shares.expires_at as expires_at",
        "shares.revoked_at as revoked_at",
        "reports.id as report_id",
        "reports.user_id as user_id",
        "reports.rendered_json as rendered_json",
        "reports.version as report_version",
        "reports.created_at as created_at"
      ])
      .where("shares.token_hash", "=", tokenHash)
      .executeTakeFirst();
  }
}

export function tenantDb(db: Kysely<Database>, userId: string): TenantDb {
  if (!userId) throw new AppError("FORBIDDEN", 403, "A tenant is required.");
  return new TenantDb(db, userId);
}
