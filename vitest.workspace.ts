import { defineWorkspace } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;
const alias = [
  {
    find: /^@job-checker\/contracts\/scope$/,
    replacement: path.join(root, "packages/contracts/src/scope.ts")
  },
  {
    find: /^@job-checker\/contracts\/money$/,
    replacement: path.join(root, "packages/contracts/src/money.ts")
  },
  {
    find: /^@job-checker\/contracts\/facts$/,
    replacement: path.join(root, "packages/contracts/src/facts/employment-v1.ts")
  },
  {
    find: /^@job-checker\/contracts$/,
    replacement: path.join(root, "packages/contracts/src/index.ts")
  },
  { find: /^@job-checker\/db$/, replacement: path.join(root, "packages/db/src/index.ts") },
  {
    find: /^@job-checker\/identity$/,
    replacement: path.join(root, "packages/identity/src/index.ts")
  },
  {
    find: /^@job-checker\/documents$/,
    replacement: path.join(root, "packages/documents/src/index.ts")
  },
  {
    find: /^@job-checker\/extraction$/,
    replacement: path.join(root, "packages/extraction/src/index.ts")
  },
  { find: /^@job-checker\/rules$/, replacement: path.join(root, "packages/rules/src/index.ts") },
  {
    find: /^@job-checker\/benchmarks$/,
    replacement: path.join(root, "packages/benchmarks/src/index.ts")
  },
  {
    find: /^@job-checker\/reports$/,
    replacement: path.join(root, "packages/reports/src/index.ts")
  },
  {
    find: /^@job-checker\/explanations$/,
    replacement: path.join(root, "packages/explanations/src/index.ts")
  },
  { find: /^@job-checker\/audit$/, replacement: path.join(root, "packages/audit/src/index.ts") },
  {
    find: /^@job-checker\/observability\/env$/,
    replacement: path.join(root, "packages/observability/src/env.ts")
  },
  {
    find: /^@job-checker\/observability$/,
    replacement: path.join(root, "packages/observability/src/index.ts")
  }
];

export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: "unit",
      environment: "node",
      include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts", "tools/**/*.test.ts"],
      exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
      setupFiles: ["./tests/setup.ts"]
    }
  },
  {
    resolve: { alias },
    test: {
      name: "integration",
      environment: "node",
      include: [
        "packages/**/test/**/*.integration.test.ts",
        "apps/**/test/**/*.integration.test.ts"
      ],
      exclude: ["**/node_modules/**"],
      setupFiles: ["./tests/setup.ts"],
      globalSetup: ["./tests/integration-global-setup.ts"],
      testTimeout: 30_000,
      hookTimeout: 60_000
    }
  }
]);
