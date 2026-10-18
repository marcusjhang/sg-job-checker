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
import { completeUpload } from "@job-checker/documents";
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
    checkRateLimit("uploadIntent", actor.userId, RATE_LIMITS.uploadIntent);
    const { id } = await context.params;
    const body = (await request.json()) as { operationKey?: unknown };
    if (typeof body.operationKey !== "string") {
      throw new AppError("VALIDATION_FAILED", 422, "An operation key is required.");
    }
    const result = await completeUpload(getDb(), actor, {
      intentId: id,
      operationKey: body.operationKey
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error, correlationId, "uploads.complete");
  }
}
