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
import { acceptPolicy } from "@job-checker/documents";
import { AppError } from "@job-checker/contracts";
import { errorResponse, jsonResponse } from "@/lib/api";

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    const actor = await requireUser(request, getDb(), staffEmails());
    checkRateLimit("mutation", actor.userId, RATE_LIMITS.mutation);
    const body = (await request.json()) as { policyVersionId?: unknown };
    if (typeof body.policyVersionId !== "string") {
      throw new AppError("VALIDATION_FAILED", 422, "A policy version is required.");
    }
    const result = await acceptPolicy(getDb(), actor, body.policyVersionId);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error, correlationId, "policies.accept");
  }
}
