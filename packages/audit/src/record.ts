import { createHmac } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@job-checker/db";
import { env } from "@job-checker/observability/env";

export type AuditInput = {
  userId: string | null;
  actorType: "USER" | "STAFF" | "SYSTEM" | "WORKER";
  actorId?: string;
  action: string;
  subjectType: string;
  subjectId: string;
  result: "SUCCESS" | "FAILURE" | "DENIED";
  metadata?: Record<string, string | number | boolean | null>;
};

export function hashIdentifier(value: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(value).digest("hex").slice(0, 32);
}

export async function recordAudit(trx: Kysely<Database>, input: AuditInput): Promise<void> {
  const metadata = input.metadata ?? {};
  await trx
    .insertInto("audit_records")
    .values({
      user_id: input.userId,
      actor_type: input.actorType,
      actor_id_hash: input.actorId ? hashIdentifier(input.actorId) : null,
      action: input.action,
      subject_type: input.subjectType,
      subject_id_hash: hashIdentifier(input.subjectId),
      result: input.result,
      metadata: JSON.stringify(metadata)
    })
    .execute();
}
