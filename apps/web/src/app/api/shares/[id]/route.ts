import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb } from "@job-checker/db";
import { requireMutationGuards, requireUser } from "@job-checker/identity";
import { staffEmails } from "@job-checker/observability/env";
import { revokeShare } from "@job-checker/reports";
import { errorResponse, jsonResponse } from "@/lib/api";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    const actor = await requireUser(request, getDb(), staffEmails());
    const { id } = await context.params;
    await revokeShare(getDb(), actor, id);
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error, correlationId, "shares.delete");
  }
}
