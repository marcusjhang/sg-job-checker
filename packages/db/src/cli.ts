import { createDb } from "./client";
import { runMigrations } from "./migrate";
import { seedDatabase } from "./seed";
import { env } from "@job-checker/observability/env";
import pg from "pg";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "migrate";
  if (command === "migrate") {
    const applied = await runMigrations(env().DATABASE_URL);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Already up to date");
    return;
  }
  if (command === "seed") {
    const db = createDb(env().DATABASE_URL);
    try {
      await seedDatabase(db);
      console.log("Seed complete");
    } finally {
      await db.destroy();
    }
    return;
  }
  if (command === "reset") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to reset a production database");
    }
    const client = new pg.Client({ connectionString: env().DATABASE_URL });
    await client.connect();
    await client.query("drop schema public cascade; create schema public;");
    await client.end();
    console.log("Schema reset");
    await runMigrations(env().DATABASE_URL);
    const db = createDb(env().DATABASE_URL);
    try {
      await seedDatabase(db);
    } finally {
      await db.destroy();
    }
    console.log("Migrated and seeded");
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
