import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb, tenantDb } from "@job-checker/db";
import {
  requireMutationGuards,
  requireUser,
  checkRateLimit,
  RATE_LIMITS
} from "@job-checker/identity";
import { staffEmails } from "@job-checker/observability/env";
import { draftHrMessage } from "@job-checker/explanations";
import type { ReportRenderModel } from "@job-checker/contracts";
import { errorResponse, jsonResponse } from "@/lib/api";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    const actor = await requireUser(request, getDb(), staffEmails());
    checkRateLimit("hrDraft", actor.userId, RATE_LIMITS.hrDraft);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { selectedQuestionIds?: unknown };
    const report = await tenantDb(getDb(), actor.userId).report(id);
    const model = report.rendered_json as ReportRenderModel;
    const selected = Array.isArray(body.selectedQuestionIds)
      ? body.selectedQuestionIds.filter((value): value is string => typeof value === "string")
      : [];
    const draft = draftHrMessage(model, selected);
    return jsonResponse(draft);
  } catch (error) {
    return errorResponse(error, correlationId, "reports.hrDraft");
  }
}
