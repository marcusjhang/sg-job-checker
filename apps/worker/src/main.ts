import os from "node:os";
import { getDb, closeDb, leaseJobs, requeueExpiredLeases } from "@job-checker/db";
import { cleanupOrphanUploads, expireRetention } from "@job-checker/documents";
import { logger } from "@job-checker/observability";
import { processJob } from "./runner";

const workerId = process.env.WORKER_ID ?? `${os.hostname()}-${process.pid}`;
let running = true;
let lastMaintenance = 0;

async function maintenance(): Promise<void> {
  if (Date.now() - lastMaintenance < 60_000) return;
  lastMaintenance = Date.now();
  try {
    const expired = await requeueExpiredLeases(getDb());
    const orphans = await cleanupOrphanUploads(getDb());
    const retained = await expireRetention(getDb());
    logger.info({
      event: "worker.maintenance",
      count: expired,
      outcome: "ok",
      bytesBucket: "<64KB"
    });
    if (orphans > 0 || retained > 0) {
      logger.info({ event: "worker.cleanup", count: orphans + retained, outcome: "ok" });
    }
  } catch {
    logger.warn({ event: "worker.maintenance", errorCode: "MAINTENANCE_FAILED", outcome: "error" });
  }
}

async function main(): Promise<void> {
  logger.info({ event: "worker.start", workerId });
  const db = getDb();
  while (running) {
    try {
      await maintenance();
      const jobs = await leaseJobs(db, workerId, 5);
      if (jobs.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      logger.info({ event: "worker.lease", count: jobs.length, workerId });
      for (const job of jobs) {
        if (!running) break;
        await processJob(db, job, workerId);
      }
    } catch {
      logger.error({ event: "worker.loop", errorCode: "LOOP_FAILED" });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  await closeDb();
  logger.info({ event: "worker.stop", workerId });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ event: "worker.shutdown", workerId, outcome: signal });
  running = false;
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((error) => {
  logger.error({ event: "worker.fatal", errorCode: errorCodeOf(error) });
  process.exit(1);
});

function errorCodeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "INTERNAL";
}
