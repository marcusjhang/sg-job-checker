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
import { confirmFacts } from "@job-checker/reports";
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
    checkRateLimit("mutation", actor.userId, RATE_LIMITS.mutation);
    const { id } = await context.params;
    const body = (await request.json()) as {
      facts?: unknown;
      extractionRevisionId?: unknown;
      confirmedFields?: unknown;
      absentFields?: unknown;
    };
    if (!Array.isArray(body.confirmedFields) || !Array.isArray(body.absentFields)) {
      throw new AppError("VALIDATION_FAILED", 422, "Confirm every critical field explicitly.");
    }
    const result = await confirmFacts(getDb(), actor, id, {
      facts: body.facts,
      ...(typeof body.extractionRevisionId === "string"
        ? { extractionRevisionId: body.extractionRevisionId }
        : {}),
      confirmedFields: body.confirmedFields.filter((key): key is string => typeof key === "string"),
      absentFields: body.absentFields.filter((key): key is string => typeof key === "string")
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error, correlationId, "documents.confirm");
  }
}
