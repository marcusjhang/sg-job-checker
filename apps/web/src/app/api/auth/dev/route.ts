import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb } from "@job-checker/db";
import { getOrCreateUser } from "@job-checker/identity";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  cookieHeader,
  createSessionToken,
  csrfToken
} from "@job-checker/identity";
import { checkRateLimit, RATE_LIMITS } from "@job-checker/identity";
import { AppError } from "@job-checker/contracts";
import { env, staffEmails } from "@job-checker/observability/env";
import { errorResponse, jsonResponse } from "@/lib/api";
import { requireMutationGuards } from "@job-checker/identity";

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    if (env().AUTH_MODE !== "dev") {
      throw new AppError("FORBIDDEN", 403, "Use the configured identity provider.");
    }
    if (env().NODE_ENV === "production" && env().ALLOW_DEV_AUTH !== "true") {
      throw new AppError(
        "FORBIDDEN",
        403,
        "Development sign-in is disabled in production. Configure the OIDC provider."
      );
    }
    const body = (await request.json()) as { email?: unknown; name?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      throw new AppError("VALIDATION_FAILED", 422, "Enter a valid email address.", {
        fieldErrors: [{ field: "email", message: "Enter a valid email address." }]
      });
    }
    checkRateLimit(
      "auth",
      `${email}:${request.headers.get("x-forwarded-for") ?? "local"}`,
      RATE_LIMITS.auth
    );
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : null;
    const actor = await getOrCreateUser(
      getDb(),
      email,
      name || email.split("@")[0] || null,
      staffEmails().has(email)
    );
    const { token } = createSessionToken(email);

    const response = jsonResponse({ ok: true, userId: actor.userId, isStaff: actor.isStaff });
    response.headers.append(
      "set-cookie",
      cookieHeader(SESSION_COOKIE, token, { maxAge: 60 * 60 * 8 })
    );
    response.headers.append(
      "set-cookie",
      cookieHeader(CSRF_COOKIE, csrfToken(), { maxAge: 60 * 60 * 8, httpOnly: false })
    );
    return response;
  } catch (error) {
    return errorResponse(error, correlationId, "auth.dev");
  }
}
