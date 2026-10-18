import { notFound } from "next/navigation";
import { getDb, tenantDb } from "@job-checker/db";
import { requirePageActor } from "@/lib/auth";
import type { ReportRenderModel } from "@job-checker/contracts";
import { ReportView } from "@/components/report-view";
import { ReportActions } from "@/components/report-actions";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const tenant = tenantDb(getDb(), actor.userId);
  let report;
  try {
    report = await tenant.report(id);
  } catch {
    notFound();
  }
  const evidence = await tenant.evidenceForReport(id);
  const shares = await getDb()
    .selectFrom("shares")
    .select(["id", "expires_at", "revoked_at"])
    .where("user_id", "=", actor.userId)
    .where("report_id", "=", id)
    .orderBy("created_at", "desc")
    .execute();
  const model = report.rendered_json as ReportRenderModel;

  return (
    <div className="wrap" style={{ maxWidth: 980 }}>
      <ReportActions
        reportId={report.id}
        documentId={report.document_id}
        questions={model.questions.map((question) => ({ id: question.id, text: question.text }))}
        shares={shares.map((share) => ({
          id: share.id,
          expiresAt: share.expires_at.toISOString(),
          revoked: share.revoked_at !== null
        }))}
        status={report.status}
        confirmedRevisionId={report.confirmed_revision_id}
        reportPeriod={model.factsSummary.compensationPeriod}
      />
      <ReportView
        model={model}
        evidence={evidence.map((row) => ({
          key: row.key,
          category: row.category,
          steps: row.steps,
          applicability: row.applicability,
          warnings: row.warnings,
          effectiveDate: row.effective_date,
          ruleVersionId: row.rule_version_id
        }))}
      />
    </div>
  );
}
