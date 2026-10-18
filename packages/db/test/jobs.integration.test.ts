import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import {
  cancelSubjectJobs,
  completeJob,
  createDb,
  createTestDatabase,
  enqueueJob,
  leaseJobs,
  requeueExpiredLeases,
  retryJob,
  type Database,
  type TestDatabase
} from "@job-checker/db";
import { getOrCreateUser } from "@job-checker/identity";

let testDb: TestDatabase;
let db: Kysely<Database>;
let userId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  db = createDb(testDb.url);
  const actor = await getOrCreateUser(db, "jobs@example.com", "Jobs", false);
  userId = actor.userId;
});

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
});

afterAll(async () => {
  if (db) await db.destroy();
  if (testDb) await testDb.drop();
});

describe("durable jobs", () => {
  it("deduplicates by occurrence key", async () => {
    const occurrenceKey = randomUUID();
    const first = await enqueueJob(db, {
      userId,
      kind: "SCAN_DOCUMENT",
      subjectId: randomUUID(),
      subjectVersion: 1,
      occurrenceKey
    });
    const second = await enqueueJob(db, {
      userId,
      kind: "SCAN_DOCUMENT",
      subjectId: randomUUID(),
      subjectVersion: 1,
      occurrenceKey
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("leases a job to exactly one of two competing workers", async () => {
    await enqueueJob(db, {
      userId,
      kind: "EXTRACT_DOCUMENT",
      subjectId: randomUUID(),
      subjectVersion: 1,
      occurrenceKey: randomUUID()
    });
    const [a, b] = await Promise.all([
      leaseJobs(db, "worker-a", 10),
      leaseJobs(db, "worker-b", 10)
    ]);
    const all = [...a, ...b].filter((job) => job.kind === "EXTRACT_DOCUMENT");
    expect(all.length).toBe(1);
  });

  it("retries with backoff and eventually fails at max attempts", async () => {
    const job = await enqueueJob(db, {
      userId,
      kind: "SCAN_DOCUMENT",
      subjectId: randomUUID(),
      subjectVersion: 1,
      occurrenceKey: randomUUID(),
      maxAttempts: 1
    });
    const [leased] = await leaseJobs(db, "worker-c", 1);
    expect(leased?.id).toBe(job.id);
    if (!leased) throw new Error("expected lease");
    const outcome = await retryJob(db, leased.id, "worker-c", "TEST_FAILURE", 0);
    expect(outcome).toBe("FAILED");
    const row = await db
      .selectFrom("jobs")
      .select(["state", "last_error_code"])
      .where("id", "=", job.id)
      .executeTakeFirst();
    expect(row?.state).toBe("FAILED");
    expect(row?.last_error_code).toBe("TEST_FAILURE");
  });

  it("lets cancellation beat a late completion", async () => {
    const subjectId = randomUUID();
    const job = await enqueueJob(db, {
      userId,
      kind: "EXTRACT_DOCUMENT",
      subjectId,
      subjectVersion: 1,
      occurrenceKey: randomUUID()
    });
    const [leased] = await leaseJobs(db, "worker-d", 1);
    if (!leased) throw new Error("expected lease");
    await cancelSubjectJobs(db, userId, subjectId, "SUBJECT_DELETED");
    const completed = await completeJob(db, leased.id, "worker-d");
    expect(completed).toBe(false);
    const row = await db
      .selectFrom("jobs")
      .select("state")
      .where("id", "=", job.id)
      .executeTakeFirst();
    expect(row?.state).toBe("CANCELLED");
  });

  it("recovers an expired lease into retry", async () => {
    const job = await enqueueJob(db, {
      userId,
      kind: "SCAN_DOCUMENT",
      subjectId: randomUUID(),
      subjectVersion: 1,
      occurrenceKey: randomUUID(),
      maxAttempts: 3
    });
    const leasedJobs = await leaseJobs(db, "worker-e", 50, ["SCAN_DOCUMENT"]);
    const leased = leasedJobs.find((item) => item.id === job.id);
    if (!leased) throw new Error("expected lease");
    await db
      .updateTable("jobs")
      .set({ lease_expires_at: new Date(Date.now() - 60_000) })
      .where("id", "=", job.id)
      .execute();
    const recovered = await requeueExpiredLeases(db);
    expect(recovered).toBeGreaterThanOrEqual(1);
    const row = await db
      .selectFrom("jobs")
      .select("state")
      .where("id", "=", job.id)
      .executeTakeFirst();
    expect(row?.state).toBe("RETRY");
  });
});
