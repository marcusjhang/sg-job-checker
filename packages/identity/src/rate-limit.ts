import { createHmac } from "node:crypto";
import { AppError } from "@job-checker/contracts";
import { env } from "@job-checker/observability/env";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitPolicy = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  auth: { limit: 10, windowMs: 60_000 },
  uploadIntent: { limit: 20, windowMs: 60_000 },
  extractionRetry: { limit: 5, windowMs: 60_000 },
  reportGeneration: { limit: 10, windowMs: 60_000 },
  hrDraft: { limit: 10, windowMs: 60_000 },
  shareResolve: { limit: 60, windowMs: 60_000 },
  mutation: { limit: 120, windowMs: 60_000 }
} satisfies Record<string, RateLimitPolicy>;

function keyFor(scope: string, identity: string): string {
  return createHmac("sha256", env().SESSION_SECRET)
    .update(`${scope}:${identity}`)
    .digest("hex")
    .slice(0, 32);
}

export function checkRateLimit(scope: string, identity: string, policy: RateLimitPolicy): void {
  const key = keyFor(scope, identity);
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return;
  }
  if (bucket.count >= policy.limit) {
    throw new AppError("RATE_LIMITED", 429, "Too many requests. Try again shortly.", {
      retryable: true
    });
  }
  bucket.count += 1;
}

export function resetRateLimits(): void {
  buckets.clear();
}
