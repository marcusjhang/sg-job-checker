import { sql, type Kysely } from "kysely";
import type { Selectable } from "kysely";
import type { Database, JobsTable } from "./schema";

export type JobKind =
  | "SCAN_DOCUMENT"
  | "EXTRACT_DOCUMENT"
  | "DELETE_DOCUMENT"
  | "EXPIRE_RETENTION"
  | "CHECK_SOURCE"
  | "INGEST_BENCHMARK"
  | "MARK_AFFECTED_REPORTS";

export type EnqueueJobInput = {
  userId: string;
  kind: JobKind;
  subjectId: string;
  subjectVersion: number | string;
  occurrenceKey: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  availableAt?: Date;
};

export async function enqueueJob(
  trx: Kysely<Database>,
  input: EnqueueJobInput
): Promise<{ id: string; created: boolean }> {
  const inserted = await sql<{ id: string }>`
    insert into jobs (user_id, kind, subject_id, subject_version, occurrence_key, state, payload, max_attempts, available_at)
    values (${input.userId}, ${input.kind}, ${input.subjectId}, ${input.subjectVersion},
      ${input.occurrenceKey}, 'PENDING', ${JSON.stringify(input.payload ?? {})}::jsonb,
      ${input.maxAttempts ?? 3}, ${input.availableAt ?? new Date(Date.now() - 1000)})
    on conflict (user_id, kind, occurrence_key) do nothing
    returning id
  `.execute(trx);
  if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };
  const existing = await sql<{ id: string }>`
    select id from jobs
    where user_id = ${input.userId} and kind = ${input.kind} and occurrence_key = ${input.occurrenceKey}
  `.execute(trx);
  const row = existing.rows[0];
  if (!row) throw new Error("Failed to enqueue job");
  return { id: row.id, created: false };
}

export async function leaseJobs(
  db: Kysely<Database>,
  workerId: string,
  limit = 5,
  kinds: JobKind[] | null = null,
  leaseSeconds = 120
): Promise<Array<Selectable<JobsTable>>> {
  const kindFilter =
    kinds === null ? sql`true` : sql`kind in (${sql.join(kinds.map((kind) => sql`${kind}`))})`;
  const result = await sql<Selectable<JobsTable>>`
    with candidate as (
      select id from jobs
      where state in ('PENDING', 'RETRY')
        and available_at <= now()
        and attempt_count < max_attempts
        and ${kindFilter}
      order by available_at asc, created_at asc
      for update skip locked
      limit ${limit}
    )
    update jobs j
    set state = 'LEASED',
        lease_owner = ${workerId},
        lease_expires_at = now() + make_interval(secs => ${leaseSeconds}),
        attempt_count = j.attempt_count + 1
    from candidate c
    where j.id = c.id
    returning j.*
  `.execute(db);
  return result.rows;
}

export async function completeJob(
  trx: Kysely<Database>,
  jobId: string,
  workerId: string
): Promise<boolean> {
  const result = await sql`
    update jobs
    set state = 'COMPLETED', lease_owner = null, lease_expires_at = null, completed_at = now()
    where id = ${jobId} and state = 'LEASED' and lease_owner = ${workerId}
  `.execute(trx);
  return Number(result.numAffectedRows ?? 0) === 1;
}

export async function retryJob(
  trx: Kysely<Database>,
  jobId: string,
  workerId: string,
  errorCode: string,
  delaySeconds: number
): Promise<"RETRY" | "FAILED" | "STALE"> {
  const result = await sql<{ state: string }>`
    update jobs
    set last_error_code = ${errorCode},
        lease_owner = null,
        lease_expires_at = null,
        state = case when attempt_count >= max_attempts then 'FAILED' else 'RETRY' end,
        available_at = now() + make_interval(secs => ${delaySeconds}),
        completed_at = case when attempt_count >= max_attempts then now() else null end
    where id = ${jobId} and state = 'LEASED' and lease_owner = ${workerId}
    returning state
  `.execute(trx);
  const state = result.rows[0]?.state;
  if (!state) return "STALE";
  return state === "FAILED" ? "FAILED" : "RETRY";
}

export async function failJob(
  trx: Kysely<Database>,
  jobId: string,
  workerId: string,
  errorCode: string
): Promise<void> {
  await sql`
    update jobs
    set state = 'FAILED', last_error_code = ${errorCode}, lease_owner = null,
        lease_expires_at = null, completed_at = now()
    where id = ${jobId} and state = 'LEASED' and lease_owner = ${workerId}
  `.execute(trx);
}

export async function cancelSubjectJobs(
  trx: Kysely<Database>,
  userId: string,
  subjectId: string,
  reason: string
): Promise<number> {
  const result = await sql`
    update jobs
    set state = 'CANCELLED', last_error_code = ${reason}, lease_owner = null,
        lease_expires_at = null, completed_at = now()
    where user_id = ${userId} and subject_id = ${subjectId}
      and state in ('PENDING', 'RETRY', 'LEASED')
  `.execute(trx);
  return Number(result.numAffectedRows ?? 0);
}

export async function releaseLease(
  db: Kysely<Database>,
  jobId: string,
  workerId: string
): Promise<void> {
  await sql`
    update jobs
    set state = 'RETRY', lease_owner = null, lease_expires_at = null,
        available_at = now() + interval '30 seconds'
    where id = ${jobId} and state = 'LEASED' and lease_owner = ${workerId}
  `.execute(db);
}

export async function requeueExpiredLeases(db: Kysely<Database>): Promise<number> {
  const result = await sql`
    update jobs
    set state = case when attempt_count >= max_attempts then 'FAILED' else 'RETRY' end,
        last_error_code = coalesce(last_error_code, 'LEASE_EXPIRED'),
        lease_owner = null,
        lease_expires_at = null,
        available_at = now(),
        completed_at = case when attempt_count >= max_attempts then now() else null end
    where state = 'LEASED' and lease_expires_at < now()
  `.execute(db);
  return Number(result.numAffectedRows ?? 0);
}

export async function queueMetrics(db: Kysely<Database>): Promise<Record<string, number>> {
  const result = await sql<{ state: string; count: string }>`
    select state, count(*)::text as count from jobs group by state
  `.execute(db);
  return Object.fromEntries(result.rows.map((row) => [row.state, Number(row.count)]));
}
