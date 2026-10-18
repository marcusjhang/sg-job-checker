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
import { createShareLink } from "@job-checker/reports";
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
    const result = await createShareLink(getDb(), actor, id);
    return jsonResponse(
      {
        shareId: result.shareId,
        token: result.token,
        url: `/r/${result.token}`,
        expiresAt: result.expiresAt
      },
      201
    );
  } catch (error) {
    return errorResponse(error, correlationId, "reports.share");
  }
}
