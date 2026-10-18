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
import { createManualDocument } from "@job-checker/documents";
import { AppError } from "@job-checker/contracts";
import { errorResponse, jsonResponse } from "@/lib/api";

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    const actor = await requireUser(request, getDb(), staffEmails());
    checkRateLimit("uploadIntent", actor.userId, RATE_LIMITS.uploadIntent);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.kind !== "string" ||
      typeof body.policyAcceptanceId !== "string" ||
      typeof body.operationKey !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.operationKey)
    ) {
      throw new AppError("VALIDATION_FAILED", 422, "The document request is incomplete.");
    }
    const result = await createManualDocument(getDb(), actor, {
      kind: body.kind,
      policyAcceptanceId: body.policyAcceptanceId,
      operationKey: body.operationKey
    });
    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error, correlationId, "documents.manual");
  }
}
