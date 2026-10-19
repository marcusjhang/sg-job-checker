import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const env = {
  ...process.env,
  NODE_ENV: "development",
  APP_URL: "http://127.0.0.1:3100",
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://jobchecker:jobchecker@localhost:5433/jobchecker",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-session-secret-at-least-24-chars",
  MASTER_KEY: process.env.MASTER_KEY ?? "e2e-master-key-at-least-24-chars",
  STAFF_EMAILS: process.env.STAFF_EMAILS ?? "staff@example.com",
  STORAGE_DRIVER: "local",
  STORAGE_DIR: ".data/e2e-objects",
  SCAN_MODE: "policy",
  AUTH_MODE: "dev",
  LOG_LEVEL: "warn",
  PORT: "3100"
};

function waitForPort(port, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs)
          reject(new Error(`Timed out waiting for port ${port}`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

if (!process.env.CI) {
  const compose = spawnSync("docker", ["compose", "up", "-d", "postgres"], {
    cwd: process.cwd(),
    env,
    stdio: "inherit"
  });
  if (compose.status !== 0) {
    console.warn("Could not start docker compose; assuming PostgreSQL is running");
  }
}

for (let attempt = 0; attempt < 60; attempt += 1) {
  const probe = spawnSync("pg_isready", ["-h", "127.0.0.1", "-p", "5433", "-U", "jobchecker"], {
    env,
    stdio: "ignore"
  });
  if (probe.status === 0) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

run("pnpm", ["db:migrate"]);
run("pnpm", ["db:seed"]);

const worker = spawn("pnpm", ["--filter", "@job-checker/worker", "dev"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit"
});
const web = spawn("pnpm", ["--filter", "@job-checker/web", "dev:e2e"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit"
});

const stop = () => {
  worker.kill("SIGTERM");
  web.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

try {
  await waitForPort(3100);
} catch (error) {
  stop();
  throw error;
}

await new Promise((resolve) => {
  const check = () => {
    if (worker.exitCode !== null || web.exitCode !== null) resolve(undefined);
    else setTimeout(check, 1000);
  };
  check();
});
stop();
