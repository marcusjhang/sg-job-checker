import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb, tenantDb } from "@job-checker/db";
import { requireUser } from "@job-checker/identity";
import { staffEmails } from "@job-checker/observability/env";
import { errorResponse, jsonResponse } from "@/lib/api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    const actor = await requireUser(request, getDb(), staffEmails());
    const { id } = await context.params;
    const tenant = tenantDb(getDb(), actor.userId);
    const report = await tenant.report(id);
    const evidence = await tenant.evidenceForReport(id);
    const shares = await getDb()
      .selectFrom("shares")
      .select(["id", "expires_at", "revoked_at", "created_at"])
      .where("user_id", "=", actor.userId)
      .where("report_id", "=", id)
      .orderBy("created_at", "desc")
      .execute();
    return jsonResponse({
      report: {
        id: report.id,
        version: report.version,
        status: report.status,
        createdAt: report.created_at,
        supersededAt: report.superseded_at,
        partialCoverage: report.partial_coverage,
        documentId: report.document_id,
        manifest: report.manifest
      },
      model: report.rendered_json,
      evidence: evidence.map((row) => ({
        key: row.key,
        category: row.category,
        steps: row.steps,
        applicability: row.applicability,
        warnings: row.warnings,
        effectiveDate: row.effective_date,
        ruleVersionId: row.rule_version_id
      })),
      shares: shares.map((share) => ({
        id: share.id,
        expiresAt: share.expires_at,
        revokedAt: share.revoked_at,
        createdAt: share.created_at
      }))
    });
  } catch (error) {
    return errorResponse(error, correlationId, "reports.get");
  }
}
