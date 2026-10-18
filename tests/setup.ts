(process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://jobchecker:jobchecker@localhost:5433/jobchecker";
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://jobchecker:jobchecker@localhost:5433/jobchecker";
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-at-least-24-chars";
process.env.MASTER_KEY = process.env.MASTER_KEY ?? "test-master-key-at-least-24-chars";
process.env.STAFF_EMAILS = process.env.STAFF_EMAILS ?? "staff@example.com";
process.env.STORAGE_DIR = process.env.STORAGE_DIR ?? ".data/test-objects";
process.env.SCAN_MODE = process.env.SCAN_MODE ?? "policy";
process.env.AUTH_MODE = process.env.AUTH_MODE ?? "dev";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "error";
