import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(HERE, "../migrations");

export async function runMigrations(connectionString: string): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
    const existing = await client.query<{ version: string }>(
      "select version from schema_migrations"
    );
    const done = new Set(existing.rows.map((row) => row.version));

    for (const file of files) {
      if (done.has(file)) continue;
      const body = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("begin");
      try {
        await client.query(body);
        await client.query("insert into schema_migrations (version) values ($1)", [file]);
        await client.query("commit");
        applied.push(file);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}

export async function migrationStatus(connectionString: string): Promise<{
  applied: string[];
  pending: string[];
}> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const exists = await client.query<{ exists: boolean }>(
      "select exists (select 1 from information_schema.tables where table_name = 'schema_migrations') as exists"
    );
    const applied = exists.rows[0]?.exists
      ? (await client.query<{ version: string }>("select version from schema_migrations")).rows.map(
          (row) => row.version
        )
      : [];
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
    return { applied, pending: files.filter((file) => !applied.includes(file)) };
  } finally {
    await client.end();
  }
}
