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
import { createUploadIntent } from "@job-checker/documents";
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
      typeof body.operationKey !== "string" ||
      typeof body.policyAcceptanceId !== "string" ||
      typeof body.kind !== "string" ||
      typeof body.fileName !== "string" ||
      typeof body.contentType !== "string" ||
      typeof body.byteSize !== "number"
    ) {
      throw new AppError("VALIDATION_FAILED", 422, "The upload request is incomplete.");
    }
    const result = await createUploadIntent(getDb(), actor, {
      operationKey: body.operationKey,
      policyAcceptanceId: body.policyAcceptanceId,
      kind: body.kind,
      fileName: body.fileName,
      contentType: body.contentType,
      byteSize: body.byteSize,
      ...(typeof body.sha256 === "string" ? { sha256: body.sha256 } : {})
    });
    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error, correlationId, "uploads.create");
  }
}
