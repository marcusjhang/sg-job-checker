import type { Kysely } from "kysely";
import type { Database } from "@job-checker/db";
import type { Actor } from "@job-checker/identity";
import { recordAudit } from "@job-checker/audit";
import { generateReport, type GenerateReportCommand, type GenerateReportResult } from "./generate";

export async function markAffectedReports(
  db: Kysely<Database>,
  dependencyType: "RULE" | "SOURCE" | "BENCHMARK" | "CONFIRMED_REVISION",
  dependencyId: string
): Promise<number> {
  const rows = await db
    .selectFrom("report_dependencies")
    .select("report_id")
    .where("dependency_type", "=", dependencyType)
    .where("dependency_id", "=", dependencyId)
    .execute();
  let marked = 0;
  for (const row of rows) {
    const updated = await db
      .updateTable("reports")
      .set({ status: "SUPERSEDED", superseded_at: new Date() })
      .where("id", "=", row.report_id)
      .where("status", "=", "GENERATED")
      .returning("id")
      .executeTakeFirst();
    if (updated) marked += 1;
  }
  return marked;
}

export async function regenerateReport(
  db: Kysely<Database>,
  actor: Actor,
  documentId: string,
  command: GenerateReportCommand
): Promise<GenerateReportResult> {
  const result = await generateReport(db, actor, documentId, command);
  await recordAudit(db, {
    userId: actor.userId,
    actorType: "USER",
    actorId: actor.userId,
    action: "report.regenerate",
    subjectType: "report",
    subjectId: result.reportId,
    result: "SUCCESS",
    metadata: { reportVersion: result.reportVersion }
  });
  return result;
}
