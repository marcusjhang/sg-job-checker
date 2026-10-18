import pg from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import type { Database } from "./schema";
import { env } from "@job-checker/observability/env";

// DATE columns are civil dates. Keep them as ISO strings, never JS Date objects.
pg.types.setTypeParser(1082, (value: string) => value);

let pool: pg.Pool | null = null;
let instance: Kysely<Database> | null = null;

export function createDb(connectionString: string): Kysely<Database> {
  const createdPool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: createdPool })
  });
}

export function getDb(): Kysely<Database> {
  if (!instance) {
    pool = new pg.Pool({
      connectionString: env().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
    instance = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }
  return instance;
}

export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.destroy();
    instance = null;
    pool = null;
  }
}

export async function withTransaction<T>(fn: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
  return getDb()
    .transaction()
    .execute(async (trx) => fn(trx));
}

/** Deletion-service-only escape hatch for immutable user-content erasure. */
export async function enableDeletionMode(trx: Kysely<Database>): Promise<void> {
  await sql`select set_config('app.deletion', 'on', true)`.execute(trx);
}

export { sql };
