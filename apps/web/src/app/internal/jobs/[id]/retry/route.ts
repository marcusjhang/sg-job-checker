import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb, sql } from "@job-checker/db";
import { requireMutationGuards, requireUser } from "@job-checker/identity";
import { staffEmails } from "@job-checker/observability/env";
import { recordAudit } from "@job-checker/audit";
import { AppError, notFound } from "@job-checker/contracts";
import { errorResponse, jsonResponse } from "@/lib/api";

const ALLOWED_KINDS = new Set([
  "SCAN_DOCUMENT",
  "EXTRACT_DOCUMENT",
  "DELETE_DOCUMENT",
  "EXPIRE_RETENTION"
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    const actor = await requireUser(request, getDb(), staffEmails());
    if (!actor.isStaff) throw notFound();
    const { id } = await context.params;
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) {
      throw new AppError("VALIDATION_FAILED", 422, "A reason is required.");
    }
    const db = getDb();
    const result = await sql<{ id: string; kind: string }>`
      update jobs
      set state = 'RETRY',
          available_at = now(),
          last_error_code = 'STAFF_RETRY',
          max_attempts = greatest(max_attempts, attempt_count + 1),
          lease_owner = null,
          lease_expires_at = null,
          completed_at = null
      where id = ${id} and state = 'FAILED'
      returning id, kind
    `.execute(db);
    const job = result.rows[0];
    if (!job) throw notFound();
    if (!ALLOWED_KINDS.has(job.kind)) {
      throw new AppError("FORBIDDEN", 403, "This job kind is not allowlisted for operator retry.");
    }
    await recordAudit(db, {
      userId: actor.userId,
      actorType: "STAFF",
      actorId: actor.userId,
      action: "job.retry",
      subjectType: "job",
      subjectId: job.id,
      result: "SUCCESS",
      metadata: { kind: job.kind, reason: body.reason.slice(0, 200) }
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error, correlationId, "jobs.retry");
  }
}
