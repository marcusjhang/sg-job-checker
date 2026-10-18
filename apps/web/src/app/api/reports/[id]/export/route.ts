import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb, tenantDb } from "@job-checker/db";
import { requireUser } from "@job-checker/identity";
import { staffEmails } from "@job-checker/observability/env";
import { renderReportPdf } from "@job-checker/reports";
import type { ReportRenderModel } from "@job-checker/contracts";
import { errorResponse } from "@/lib/api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    const actor = await requireUser(request, getDb(), staffEmails());
    const { id } = await context.params;
    const report = await tenantDb(getDb(), actor.userId).report(id);
    const model = report.rendered_json as ReportRenderModel;
    const bytes = await renderReportPdf(model);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="job-checker-${id.slice(0, 8)}-v${report.version}.pdf"`,
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return errorResponse(error, correlationId, "reports.export");
  }
}
