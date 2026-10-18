import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb } from "@job-checker/db";
import {
  requireMutationGuards,
  requireUser,
  checkRateLimit,
  RATE_LIMITS
} from "@job-checker/identity";
import { staffEmails } from "@job-checker/observability/env";
import { generateReport } from "@job-checker/reports";
import { AppError } from "@job-checker/contracts";
import { errorResponse, jsonResponse } from "@/lib/api";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    const actor = await requireUser(request, getDb(), staffEmails());
    checkRateLimit("reportGeneration", actor.userId, RATE_LIMITS.reportGeneration);
    const { id } = await context.params;
    const body = (await request.json()) as {
      operationKey?: unknown;
      confirmedRevisionId?: unknown;
      requestedPeriod?: unknown;
    };
    if (typeof body.operationKey !== "string" || typeof body.confirmedRevisionId !== "string") {
      throw new AppError(
        "VALIDATION_FAILED",
        422,
        "Generation needs an operation key and confirmed revision."
      );
    }
    const result = await generateReport(getDb(), actor, id, {
      operationKey: body.operationKey,
      confirmedRevisionId: body.confirmedRevisionId,
      ...(typeof body.requestedPeriod === "string" ? { requestedPeriod: body.requestedPeriod } : {})
    });
    return jsonResponse(
      {
        reportId: result.reportId,
        reportVersion: result.reportVersion,
        reused: result.reused
      },
      201
    );
  } catch (error) {
    return errorResponse(error, correlationId, "documents.reports");
  }
}
