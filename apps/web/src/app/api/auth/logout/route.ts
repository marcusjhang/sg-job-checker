import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb } from "@job-checker/db";
import {
  SESSION_COOKIE,
  requireMutationGuards,
  requireUser,
  setUserSessionInvalidBefore
} from "@job-checker/identity";
import { staffEmails } from "@job-checker/observability/env";
import { errorResponse, jsonResponse } from "@/lib/api";

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    const actor = await requireUser(request, getDb(), staffEmails());
    await setUserSessionInvalidBefore(getDb(), actor.userId);
    const response = jsonResponse({ ok: true });
    response.headers.append(
      "set-cookie",
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
    return response;
  } catch (error) {
    return errorResponse(error, correlationId, "auth.logout");
  }
}
