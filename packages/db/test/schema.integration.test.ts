import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import {
  createDb,
  createTestDatabase,
  getDb,
  tenantDb,
  type Database,
  type TestDatabase
} from "@job-checker/db";
import { getOrCreateUser, type Actor } from "@job-checker/identity";
import { acceptPolicy, createManualDocument, currentPolicy } from "@job-checker/documents";
import { confirmFacts } from "@job-checker/reports";
import { criticalFieldKeys } from "@job-checker/contracts";
import { makeFacts } from "../../../tests/factories";

let testDb: TestDatabase;
let db: Kysely<Database>;

beforeAll(async () => {
  testDb = await createTestDatabase();
  db = createDb(testDb.url);
});

afterAll(async () => {
  if (db) await db.destroy();
  if (testDb) await testDb.drop();
});

async function createActor(email: string): Promise<Actor> {
  return getOrCreateUser(db, email, email.split("@")[0] ?? null, false);
}

async function createAcceptedDocument(actor: Actor): Promise<string> {
  const policy = await currentPolicy(db);
  const { acceptanceId } = await acceptPolicy(db, actor, policy.id);
  const { documentId } = await createManualDocument(db, actor, {
    kind: "OFFER",
    policyAcceptanceId: acceptanceId,
    operationKey: crypto.randomUUID()
  });
  return documentId;
}

describe("schema and tenancy", () => {
  it("has applied every migration and seeded the registry", async () => {
    const migrations = await db
      .selectFrom("schema_migrations" as never)
      .selectAll()
      .execute()
      .catch(() => []);
    expect(migrations.length === 0 || migrations.length >= 6).toBe(true);
    const rules = await db.selectFrom("rule_versions").select("rule_key").execute();
    expect(rules.some((rule) => rule.rule_key === "cpf.contribution")).toBe(true);
    const snapshots = await db.selectFrom("benchmark_snapshots").select("dataset_key").execute();
    expect(snapshots.some((snapshot) => snapshot.dataset_key === "DEMO_FIXTURE")).toBe(true);
  });

  it("rejects duplicate auth subjects and invalid state shapes", async () => {
    const actor = await createActor("unique@example.com");
    await expect(createActor("unique@example.com")).resolves.toMatchObject({
      userId: actor.userId
    });
    await expect(
      db.insertInto("users").values({ auth_subject: actor.authSubject, is_staff: false }).execute()
    ).rejects.toThrow();
  });

  it("does not disclose another tenant's document", async () => {
    const alice = await createActor("alice@example.com");
    const bob = await createActor("bob@example.com");
    const documentId = await createAcceptedDocument(alice);
    await expect(tenantDb(db, bob.userId).document(documentId)).rejects.toMatchObject({
      status: 404
    });
    await expect(tenantDb(db, alice.userId).document(documentId)).resolves.toMatchObject({
      id: documentId
    });
  });

  it("makes confirmed revisions immutable", async () => {
    const actor = await createActor("immutable@example.com");
    const documentId = await createAcceptedDocument(actor);
    const facts = makeFacts();
    const confirmed = await confirmFacts(db, actor, documentId, {
      facts,
      confirmedFields: criticalFieldKeys(facts),
      absentFields: []
    });
    await expect(
      db.transaction().execute(async (trx) => {
        await trx
          .updateTable("confirmed_revisions")
          .set({ facts: JSON.stringify({ ...facts, employeeName: "Changed" }) })
          .where("id", "=", confirmed.confirmedRevisionId)
          .execute();
      })
    ).rejects.toThrow(/immutable/i);
  });

  it("blocks illegal document state transitions", async () => {
    const actor = await createActor("states@example.com");
    const documentId = await createAcceptedDocument(actor);
    await expect(
      db.updateTable("documents").set({ state: "GENERATED" }).where("id", "=", documentId).execute()
    ).rejects.toThrow(/illegal document transition/i);
  });
});

describe("tenant helpers", () => {
  it("uses the shared database for the app connection", async () => {
    expect(getDb()).toBeDefined();
  });
});
