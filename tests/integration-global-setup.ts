import pg from "pg";

export default async function globalSetup(): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgres://jobchecker:jobchecker@localhost:5433/jobchecker";
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query("select 1");
  } catch {
    throw new Error(
      `Integration tests need PostgreSQL at ${url}. Run: docker compose up -d postgres`
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
