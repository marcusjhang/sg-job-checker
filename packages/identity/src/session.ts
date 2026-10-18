import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@job-checker/db";
import { AppError, notFound, unauthenticated } from "@job-checker/contracts";
import { env } from "@job-checker/observability/env";

export const SESSION_COOKIE = "jc_session";
export const CSRF_COOKIE = "jc_csrf";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type Actor = {
  userId: string;
  authSubject: string;
  displayName: string | null;
  isStaff: boolean;
};

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
  v: 1;
};

function secret(): string {
  return env().SESSION_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(
  authSubject: string,
  now = Date.now(),
  ttlSeconds = SESSION_TTL_SECONDS
): { token: string; expiresAt: Date } {
  const payload: SessionPayload = {
    sub: authSubject,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSeconds,
    v: 1
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(payload.exp * 1000) };
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.v !== 1 || typeof payload.sub !== "string") return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function cookieHeader(
  name: string,
  value: string,
  options: { maxAge?: number; httpOnly?: boolean } = {}
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    options.httpOnly === false ? "" : "HttpOnly",
    "SameSite=Lax",
    options.maxAge === undefined ? "" : `Max-Age=${options.maxAge}`,
    env().NODE_ENV === "production" ? "Secure" : ""
  ].filter(Boolean);
  return parts.join("; ");
}

export async function getOrCreateUser(
  db: Kysely<Database>,
  authSubject: string,
  displayName: string | null,
  isStaff: boolean
): Promise<Actor> {
  const existing = await db
    .selectFrom("users")
    .selectAll()
    .where("auth_subject", "=", authSubject)
    .executeTakeFirst();
  if (existing) {
    if (existing.is_staff !== isStaff) {
      await db
        .updateTable("users")
        .set({ is_staff: isStaff })
        .where("id", "=", existing.id)
        .execute();
    }
    return {
      userId: existing.id,
      authSubject: existing.auth_subject,
      displayName: existing.display_name,
      isStaff
    };
  }
  const inserted = await db
    .insertInto("users")
    .values({
      auth_subject: authSubject,
      display_name: displayName,
      is_staff: isStaff
    })
    .returning(["id", "auth_subject", "display_name", "is_staff"])
    .executeTakeFirstOrThrow();
  return {
    userId: inserted.id,
    authSubject: inserted.auth_subject,
    displayName: inserted.display_name,
    isStaff: inserted.is_staff
  };
}

export async function actorFromToken(
  db: Kysely<Database>,
  token: string | undefined,
  staffEmails: Set<string>
): Promise<Actor | null> {
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const row = await db
    .selectFrom("users")
    .selectAll()
    .where("auth_subject", "=", payload.sub)
    .executeTakeFirst();
  if (!row) return null;
  if (row.session_invalid_before && payload.iat * 1000 < row.session_invalid_before.valueOf()) {
    return null;
  }
  const isStaff = staffEmails.has(row.auth_subject.toLowerCase());
  return {
    userId: row.id,
    authSubject: row.auth_subject,
    displayName: row.display_name,
    isStaff
  };
}

export async function actorFromRequest(
  request: Request,
  db: Kysely<Database>,
  staffEmails: Set<string>
): Promise<Actor | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  return actorFromToken(db, cookies[SESSION_COOKIE], staffEmails);
}

export async function requireUser(
  request: Request,
  db: Kysely<Database>,
  staffEmails: Set<string>
): Promise<Actor> {
  const actor = await actorFromRequest(request, db, staffEmails);
  if (!actor) throw unauthenticated();
  return actor;
}

export function csrfToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Double-submit CSRF plus same-origin validation. The token is compared to the
 * request header and never logged.
 */
export function requireMutationGuards(request: Request): void {
  const cookies = parseCookies(request.headers.get("cookie"));
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new AppError(
      "CSRF_FAILED",
      403,
      "The request could not be verified. Refresh and try again."
    );
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("host");
    try {
      if (new URL(origin).host !== host) {
        throw new AppError("CSRF_FAILED", 403, "The request origin is not allowed.");
      }
    } catch {
      throw new AppError("CSRF_FAILED", 403, "The request origin is not allowed.");
    }
  }
}

export async function setUserSessionInvalidBefore(
  db: Kysely<Database>,
  userId: string,
  at = new Date()
): Promise<void> {
  await db
    .updateTable("users")
    .set({ session_invalid_before: at })
    .where("id", "=", userId)
    .execute();
}

export async function authorizeOwnedSubject(
  db: Kysely<Database>,
  actor: Actor,
  type: "document" | "report" | "share",
  id: string
): Promise<void> {
  const row =
    type === "document"
      ? await db
          .selectFrom("documents")
          .select("id")
          .where("id", "=", id)
          .where("user_id", "=", actor.userId)
          .executeTakeFirst()
      : type === "report"
        ? await db
            .selectFrom("reports")
            .select("id")
            .where("id", "=", id)
            .where("user_id", "=", actor.userId)
            .executeTakeFirst()
        : await db
            .selectFrom("shares")
            .select("id")
            .where("id", "=", id)
            .where("user_id", "=", actor.userId)
            .executeTakeFirst();
  if (!row) throw notFound();
}
