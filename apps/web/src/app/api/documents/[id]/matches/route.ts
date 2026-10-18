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
import { ConfirmedEmploymentFactsV1Schema, conflict, notFound } from "@job-checker/contracts";
import { MATCHER_VERSION, matchOccupation } from "@job-checker/benchmarks";
import { recordAudit } from "@job-checker/audit";
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
    const db = getDb();
    const tenant = tenantDb(db, actor.userId);
    const document = await tenant.document(id);
    const confirmed = await tenant.latestConfirmedRevision(id);
    if (!confirmed)
      throw conflict("Confirm the facts before matching an occupation.", "DOMAIN_STATE_CONFLICT");
    const facts = ConfirmedEmploymentFactsV1Schema.parse(confirmed.facts);

    const snapshot = await db
      .selectFrom("benchmark_snapshots")
      .selectAll()
      .where("review_state", "in", ["APPROVED", "DEMO"])
      .orderBy("effective_date", "desc")
      .limit(1)
      .executeTakeFirst();
    if (!snapshot) {
      return jsonResponse({
        matchId: null,
        candidates: [],
        snapshot: null,
        matcherVersion: MATCHER_VERSION
      });
    }
    const occupations = await db
      .selectFrom("occupations")
      .selectAll()
      .where("snapshot_id", "=", snapshot.id)
      .execute();
    const candidates = matchOccupation(facts, occupations);
    const inserted = await db
      .insertInto("occupation_matches")
      .values({
        user_id: actor.userId,
        confirmed_revision_id: confirmed.id,
        matcher_version: MATCHER_VERSION,
        candidates: JSON.stringify(candidates),
        selected_code: null,
        selected_by: null,
        confidence_label: candidates[0]?.confidence ?? "NONE"
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await recordAudit(db, {
      userId: actor.userId,
      actorType: "USER",
      actorId: actor.userId,
      action: "occupation.match",
      subjectType: "document",
      subjectId: document.id,
      result: "SUCCESS",
      metadata: { candidateCount: candidates.length }
    });

    return jsonResponse({
      matchId: inserted.id,
      candidates,
      matcherVersion: MATCHER_VERSION,
      snapshot: {
        datasetKey: snapshot.dataset_key,
        version: snapshot.version,
        effectiveDate: snapshot.effective_date,
        wageBasis: snapshot.wage_basis,
        limitations: snapshot.limitations,
        demo: snapshot.review_state === "DEMO" || snapshot.dataset_key === "DEMO_FIXTURE"
      }
    });
  } catch (error) {
    return errorResponse(error, correlationId, "documents.matches");
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    requireMutationGuards(request);
    const actor = await requireUser(request, getDb(), staffEmails());
    const { id } = await context.params;
    const body = (await request.json()) as { matchId?: unknown; selectedCode?: unknown };
    if (typeof body.matchId !== "string") throw notFound();
    if (body.selectedCode !== null && typeof body.selectedCode !== "string") throw notFound();
    const db = getDb();
    const row = await db
      .selectFrom("occupation_matches")
      .selectAll()
      .where("id", "=", body.matchId)
      .where("user_id", "=", actor.userId)
      .executeTakeFirst();
    if (!row) throw notFound();
    const confirmed = await tenantDb(db, actor.userId).latestConfirmedRevision(id);
    if (!confirmed || confirmed.id !== row.confirmed_revision_id) {
      throw conflict("The facts changed. Find occupations again.", "DOMAIN_STATE_CONFLICT");
    }
    const candidates = row.candidates as Array<{ code: string }>;
    if (
      body.selectedCode !== null &&
      !candidates.some((candidate) => candidate.code === body.selectedCode)
    ) {
      throw conflict("That occupation is not in the candidate set.", "DOMAIN_STATE_CONFLICT");
    }
    await db
      .updateTable("occupation_matches")
      .set({
        selected_code: body.selectedCode,
        selected_by: body.selectedCode === null ? "NONE" : "USER"
      })
      .where("id", "=", row.id)
      .execute();
    return jsonResponse({ ok: true, selectedCode: body.selectedCode });
  } catch (error) {
    return errorResponse(error, correlationId, "documents.matches.select");
  }
}
