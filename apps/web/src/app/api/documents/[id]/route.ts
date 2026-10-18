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
import { requestDeletion } from "@job-checker/documents";
import { AppError } from "@job-checker/contracts";
import { errorResponse, jsonResponse } from "@/lib/api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    const actor = await requireUser(request, getDb(), staffEmails());
    const { id } = await context.params;
    const document = await tenantDb(getDb(), actor.userId).document(id);
    const finding = await getDb()
      .selectFrom("scan_findings")
      .select(["verdict", "reason_code", "created_at"])
      .where("document_id", "=", id)
      .where("user_id", "=", actor.userId)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return jsonResponse({
      id: document.id,
      kind: document.kind,
      state: document.state,
      origin: document.origin,
      createdAt: document.created_at,
      scan: finding ? { verdict: finding.verdict, reasonCode: finding.reason_code } : null
    });
  } catch (error) {
    return errorResponse(error, correlationId, "documents.get");
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    const actor = await requireUser(request, getDb(), staffEmails());
    checkRateLimit("mutation", actor.userId, RATE_LIMITS.mutation);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { operationKey?: unknown };
    if (body.operationKey !== undefined && typeof body.operationKey !== "string") {
      throw new AppError("VALIDATION_FAILED", 422, "Invalid operation key.");
    }
    const result = await requestDeletion(
      getDb(),
      actor,
      id,
      typeof body.operationKey === "string" ? body.operationKey : randomUUID()
    );
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error, correlationId, "documents.delete");
  }
}
