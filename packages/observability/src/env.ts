import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("postgres://jobchecker:jobchecker@localhost:5433/jobchecker"),
  TEST_DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(24).default("dev-only-session-secret-change-me-32chars"),
  MASTER_KEY: z.string().default("dev-only-master-key-change-me"),
  CRON_SECRET: z.string().default("dev-only-cron-secret"),
  STAFF_EMAILS: z.string().default("staff@example.com"),
  AUTH_MODE: z.enum(["dev", "oidc"]).default("dev"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_DIR: z.string().default(".data/objects"),
  SCAN_MODE: z.enum(["policy", "clamav"]).default("policy"),
  CLAMAV_HOST: z.string().default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),
  RAW_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  ABANDONED_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  REPORT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  SHARE_TTL_DAYS: z.coerce.number().int().positive().default(7),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  BUILD_ID: z.string().default("dev"),
  EXTRACTION_PROVIDER: z.string().default("deterministic"),
  S3_REGION: z.string().default("ap-southeast-1"),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().default("false"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional()
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | null = null;

export function env(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  cached = parsed.data;
  return cached;
}

export function staffEmails(): Set<string> {
  return new Set(
    env()
      .STAFF_EMAILS.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function resetEnvForTests(): void {
  cached = null;
}
