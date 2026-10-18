import type { Kysely } from "kysely";
import type { Database } from "@job-checker/db";
import type { Actor } from "@job-checker/identity";
import { AppError, conflict, notFound, validationFailed } from "@job-checker/contracts";
import { recordAudit } from "@job-checker/audit";

export async function currentPolicy(db: Kysely<Database>) {
  const row = await db
    .selectFrom("policy_versions")
    .selectAll()
    .where("retired_at", "is", null)
    .where("effective_from", "<=", new Date())
    .orderBy("effective_from", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!row) throw new AppError("INTERNAL", 500, "No privacy policy is published.");
  return row;
}

export async function acceptPolicy(
  db: Kysely<Database>,
  actor: Actor,
  policyVersionId: string,
  method = "explicit_checkbox"
): Promise<{ acceptanceId: string }> {
  const policy = await currentPolicy(db);
  if (policy.id !== policyVersionId) {
    throw conflict(
      "The privacy notice changed. Review the current notice and accept it again.",
      "POLICY_NOT_ACCEPTED"
    );
  }
  const inserted = await db
    .insertInto("policy_acceptances")
    .values({
      user_id: actor.userId,
      policy_version_id: policy.id,
      method
    })
    .onConflict((oc) => oc.columns(["user_id", "policy_version_id"]).doNothing())
    .returning("id")
    .executeTakeFirst();

  let acceptanceId = inserted?.id;
  if (!acceptanceId) {
    const existing = await db
      .selectFrom("policy_acceptances")
      .select("id")
      .where("user_id", "=", actor.userId)
      .where("policy_version_id", "=", policy.id)
      .executeTakeFirst();
    acceptanceId = existing?.id;
  }
  if (!acceptanceId) throw new AppError("INTERNAL", 500, "Could not record acceptance.");

  await recordAudit(db, {
    userId: actor.userId,
    actorType: "USER",
    actorId: actor.userId,
    action: "policy.accept",
    subjectType: "policy_version",
    subjectId: policy.id,
    result: "SUCCESS",
    metadata: { policyKey: policy.policy_key, version: policy.version }
  });
  return { acceptanceId };
}

export async function requireCurrentAcceptance(
  db: Kysely<Database>,
  userId: string,
  acceptanceId: string
): Promise<void> {
  const policy = await currentPolicy(db);
  const acceptance = await db
    .selectFrom("policy_acceptances")
    .select(["id", "policy_version_id"])
    .where("id", "=", acceptanceId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!acceptance) throw notFound();
  if (acceptance.policy_version_id !== policy.id) {
    throw conflict(
      "The privacy notice changed. Review and accept the current notice before creating a document.",
      "POLICY_NOT_ACCEPTED"
    );
  }
}

export function assertKnownKind(value: string): "OFFER" | "CONTRACT" {
  if (value !== "OFFER" && value !== "CONTRACT") {
    throw validationFailed([{ field: "kind", message: "Choose Offer or Contract." }]);
  }
  return value;
}
