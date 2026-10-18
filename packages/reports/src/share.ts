import { createHash, randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@job-checker/db";
import type { Actor } from "@job-checker/identity";
import { notFound } from "@job-checker/contracts";
import { env } from "@job-checker/observability/env";
import { recordAudit } from "@job-checker/audit";

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createShareLink(
  db: Kysely<Database>,
  actor: Actor,
  reportId: string
): Promise<{ token: string; shareId: string; expiresAt: Date }> {
  const report = await db
    .selectFrom("reports")
    .select("id")
    .where("id", "=", reportId)
    .where("user_id", "=", actor.userId)
    .executeTakeFirst();
  if (!report) throw notFound();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env().SHARE_TTL_DAYS * 86_400_000);
  const inserted = await db
    .insertInto("shares")
    .values({
      user_id: actor.userId,
      report_id: reportId,
      token_hash: hashShareToken(token),
      expires_at: expiresAt
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await recordAudit(db, {
    userId: actor.userId,
    actorType: "USER",
    actorId: actor.userId,
    action: "share.create",
    subjectType: "share",
    subjectId: inserted.id,
    result: "SUCCESS",
    metadata: { reportId }
  });
  return { token, shareId: inserted.id, expiresAt };
}

export async function resolveShare(db: Kysely<Database>, token: string) {
  const hash = hashShareToken(token);
  const row = await db
    .selectFrom("shares")
    .innerJoin("reports", "reports.id", "shares.report_id")
    .select([
      "shares.id as share_id",
      "shares.expires_at as expires_at",
      "shares.revoked_at as revoked_at",
      "reports.id as report_id",
      "reports.rendered_json as rendered_json",
      "reports.version as report_version",
      "reports.status as report_status",
      "reports.created_at as created_at"
    ])
    .where("shares.token_hash", "=", hash)
    .executeTakeFirst();
  if (!row) throw notFound();
  if (row.revoked_at) throw notFound();
  if (row.expires_at.valueOf() <= Date.now()) throw notFound();
  return row;
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
  await recordAudit(db, {
    userId: actor.userId,
    actorType: "USER",
    actorId: actor.userId,
    action: "share.revoke",
    subjectType: "share",
    subjectId: shareId,
    result: "SUCCESS"
  });
}
