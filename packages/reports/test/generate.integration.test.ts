import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import {
  createDb,
  createTestDatabase,
  leaseJobs,
  type Database,
  type TestDatabase
} from "@job-checker/db";
import { getOrCreateUser, type Actor } from "@job-checker/identity";
import {
  acceptPolicy,
  createManualDocument,
  currentPolicy,
  executeDeletion,
  requestDeletion
} from "@job-checker/documents";
import { confirmFacts, generateReport } from "@job-checker/reports";
import { criticalFieldKeys, sgd } from "@job-checker/contracts";
import { makeFacts } from "../../../tests/factories";

let testDb: TestDatabase;
let db: Kysely<Database>;
let actor: Actor;

beforeAll(async () => {
  testDb = await createTestDatabase();
  db = createDb(testDb.url);
  actor = await getOrCreateUser(db, "flow@example.com", "Flow", false);
});

afterAll(async () => {
  if (db) await db.destroy();
  if (testDb) await testDb.drop();
});

async function newManualDocument(): Promise<string> {
  const policy = await currentPolicy(db);
  const { acceptanceId } = await acceptPolicy(db, actor, policy.id);
  const { documentId } = await createManualDocument(db, actor, {
    kind: "OFFER",
    policyAcceptanceId: acceptanceId,
    operationKey: randomUUID()
  });
  return documentId;
}

async function confirm(documentId: string, facts = makeFacts()) {
  return confirmFacts(db, actor, documentId, {
    facts,
    confirmedFields: criticalFieldKeys(facts),
    absentFields: []
  });
}

describe("atomic report generation", () => {
  it("requires confirmation before generation", async () => {
    const documentId = await newManualDocument();
    await expect(
      generateReport(db, actor, documentId, {
        operationKey: randomUUID(),
        confirmedRevisionId: randomUUID()
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("generates a reproducible report with evidence, then returns the same report for the same operation", async () => {
    const documentId = await newManualDocument();
    const facts = makeFacts({
      basicMonthlySalary: sgd(800_000),
      compensationPeriod: "2026-12",
      startDate: "2026-12-01"
    });
    const confirmed = await confirm(documentId, facts);
    const operationKey = randomUUID();
    const first = await generateReport(db, actor, documentId, {
      operationKey,
      confirmedRevisionId: confirmed.confirmedRevisionId
    });
    expect(first.reused).toBe(false);
    expect(first.reportVersion).toBe(1);
    expect(first.renderModel.partialCoverage).toBe(true);

    const evidence = await db
      .selectFrom("evidence")
      .select(["key", "output", "applicability"])
      .where("report_id", "=", first.reportId)
      .execute();
    const cpf = evidence.find((item) => item.key === "cpf.contribution");
    expect(cpf).toBeDefined();
    const cpfOutput = cpf?.output as { employeeContributionCents: number };
    expect(cpfOutput.employeeContributionCents).toBe(160_000);
    const benchmark = evidence.find((item) => item.key === "benchmark.occupation");
    expect((benchmark?.applicability as { status: string }).status).toBe("UNAVAILABLE");

    const second = await generateReport(db, actor, documentId, {
      operationKey,
      confirmedRevisionId: confirmed.confirmedRevisionId
    });
    expect(second.reused).toBe(true);
    expect(second.reportId).toBe(first.reportId);

    const report = await db
      .selectFrom("reports")
      .select(["manifest", "status"])
      .where("id", "=", first.reportId)
      .executeTakeFirst();
    expect(report?.status).toBe("GENERATED");
    const manifest = report?.manifest as {
      ruleVersions: Array<{ key: string }>;
      evidenceKeys: string[];
    };
    expect(manifest.ruleVersions.some((rule) => rule.key === "cpf.contribution")).toBe(true);
    expect(manifest.evidenceKeys).toContain("cpf.contribution");
  });

  it("supersedes the old report when facts are corrected (S$8,000 → S$6,000)", async () => {
    const documentId = await newManualDocument();
    const firstFacts = makeFacts({
      basicMonthlySalary: sgd(800_000),
      compensationPeriod: "2026-12",
      startDate: "2026-12-01"
    });
    const firstConfirmed = await confirm(documentId, firstFacts);
    const first = await generateReport(db, actor, documentId, {
      operationKey: randomUUID(),
      confirmedRevisionId: firstConfirmed.confirmedRevisionId
    });

    const correctedFacts = makeFacts({
      basicMonthlySalary: sgd(600_000),
      compensationPeriod: "2026-12",
      startDate: "2026-12-01"
    });
    const corrected = await confirm(documentId, correctedFacts);
    const old = await db
      .selectFrom("reports")
      .select(["status", "superseded_at"])
      .where("id", "=", first.reportId)
      .executeTakeFirst();
    expect(old?.status).toBe("SUPERSEDED");
    expect(old?.superseded_at).not.toBeNull();

    const second = await generateReport(db, actor, documentId, {
      operationKey: randomUUID(),
      confirmedRevisionId: corrected.confirmedRevisionId
    });
    expect(second.reportVersion).toBe(2);
    const cpf = await db
      .selectFrom("evidence")
      .select("output")
      .where("report_id", "=", second.reportId)
      .where("key", "=", "cpf.contribution")
      .executeTakeFirst();
    expect((cpf?.output as { employeeContributionCents: number }).employeeContributionCents).toBe(
      120_000
    );
  });

  it("rejects an operation key reused with different inputs", async () => {
    const documentId = await newManualDocument();
    const facts = makeFacts({
      basicMonthlySalary: sgd(600_000),
      compensationPeriod: "2026-12",
      startDate: "2026-12-01"
    });
    const confirmed = await confirm(documentId, facts);
    const operationKey = randomUUID();
    await generateReport(db, actor, documentId, {
      operationKey,
      confirmedRevisionId: confirmed.confirmedRevisionId
    });
    const corrected = await confirm(
      documentId,
      makeFacts({
        basicMonthlySalary: sgd(610_000),
        compensationPeriod: "2026-12",
        startDate: "2026-12-01"
      })
    );
    await expect(
      generateReport(db, actor, documentId, {
        operationKey,
        confirmedRevisionId: corrected.confirmedRevisionId
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("deletes the document, reports, and evidence with a non-sensitive receipt", async () => {
    const documentId = await newManualDocument();
    const facts = makeFacts({
      compensationPeriod: "2026-12",
      startDate: "2026-12-01"
    });
    const confirmed = await confirm(documentId, facts);
    const report = await generateReport(db, actor, documentId, {
      operationKey: randomUUID(),
      confirmedRevisionId: confirmed.confirmedRevisionId
    });
    await requestDeletion(db, actor, documentId, randomUUID());
    const jobs = await leaseJobs(db, "flow-worker", 5, ["DELETE_DOCUMENT"]);
    const job = jobs.find((item) => item.subject_id === documentId);
    if (!job) throw new Error("expected deletion job");
    const result = await executeDeletion(db, job);
    expect(result).not.toBe("CANCELLED_STALE");

    expect(
      await db.selectFrom("documents").select("id").where("id", "=", documentId).executeTakeFirst()
    ).toBeUndefined();
    expect(
      await db
        .selectFrom("reports")
        .select("id")
        .where("id", "=", report.reportId)
        .executeTakeFirst()
    ).toBeUndefined();
    expect(
      await db
        .selectFrom("evidence")
        .select("id")
        .where("report_id", "=", report.reportId)
        .executeTakeFirst()
    ).toBeUndefined();
  });
});
