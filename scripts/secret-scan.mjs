#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  ".data",
  "playwright-report",
  "test-results",
  ".psf"
]);
const PATTERNS = [
  { name: "private key", regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub token", regex: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: "OpenAI key", regex: /sk-[A-Za-z0-9]{32,}/ },
  { name: "Slack token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/ }
];

let findings = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs|json|yml|yaml|md|env|txt|sql)$/.test(entry.name)) continue;
    if (entry.name === ".env.example") continue;
    const text = fs.readFileSync(full, "utf8");
    for (const pattern of PATTERNS) {
      if (pattern.regex.test(text)) {
        findings += 1;
        console.error(`${pattern.name}: ${path.relative(ROOT, full)}`);
      }
    }
  }
}
walk(ROOT);
if (findings > 0) {
  console.error(`Secret scan failed with ${findings} finding(s).`);
  process.exit(1);
}
console.log("Secret scan passed.");
