import pg from "pg";
import { randomBytes } from "node:crypto";
import { runMigrations } from "./migrate";
import { createDb } from "./client";
import { env } from "@job-checker/observability/env";

export type TestDatabase = { url: string; name: string; drop: () => Promise<void> };

export async function createTestDatabase(): Promise<TestDatabase> {
  const baseUrl = env().TEST_DATABASE_URL ?? env().DATABASE_URL;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  const name = `jc_test_${Date.now()}_${randomBytes(3).toString("hex")}`;
  try {
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const db = createDb(url.toString());
  try {
    await runMigrations(url.toString());
    await seedTestSources(db);
  } finally {
    await db.destroy();
  }
  return {
    url: url.toString(),
    name,
    drop: async () => {
      const closer = new pg.Client({ connectionString: baseUrl });
      await closer.connect();
      try {
        await closer.query(`drop database if exists "${name}" with (force)`);
      } finally {
        await closer.end();
      }
    }
  };
}

async function seedTestSources(db: ReturnType<typeof createDb>): Promise<void> {
  const { seedDatabase } = await import("./seed");
  await seedDatabase(db);
}
