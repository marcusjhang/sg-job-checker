# Development and operations

## Toolchain

| Tool       | Version                                                               |
| ---------- | --------------------------------------------------------------------- |
| Node.js    | 22 LTS (24 also tested)                                               |
| pnpm       | 10.18                                                                 |
| TypeScript | 5.9 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Next.js    | 16.4 App Router                                                       |
| React      | 19.2                                                                  |
| PostgreSQL | 17 (Docker)                                                           |
| Vitest     | 3.2                                                                   |
| Playwright | 1.64                                                                  |

`NODE_ENV` must not be globally exported when running `next build`; the web build
script unsets it because a non-production value breaks Next's prerender.

## Local commands

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev            # 127.0.0.1:3000
pnpm dev:worker
```

Staff pages: `/sources`, `/operations` for emails in `STAFF_EMAILS`.

## Test layers

- `pnpm test`: schemas, CPF/compensation/KET/Employment Act, matcher, explanation
  policy, file policy, telemetry redaction.
- `pnpm test:integration`: real PostgreSQL databases per suite; migrations,
  constraints, tenant isolation, immutable rows, job races, upload, deletion,
  report generation/idempotency/supersession.
- `pnpm test:e2e`: browser flow from sign-in through report, PDF, share, revoke,
  deletion, upload/scan/extract, plus axe checks.

## SLO assumptions (Phase 1A)

| Interaction                                     | Target                  |
| ----------------------------------------------- | ----------------------- |
| Authenticated reads/writes (excluding transfer) | p95 ≤ 500 ms            |
| Report generation after confirmation            | p95 ≤ 10 s healthy      |
| Extraction complete                             | 95% ≤ 3 min             |
| Availability                                    | 99.5% monthly concierge |

Measured baseline: not yet collected. Record real concierge traffic and provider
latency here before self-serve launch.

## Deployment notes

- Run migrations before code that needs them (expand/migrate/contract).
- Rule/source/benchmark activation is data-plane configuration with independent
  approval; deploys do not activate them.
- Web and worker accept current and previous job payload versions during rolling
  deploys. Unknown newer payloads stay retryable.
- Canary and rollback: suspend a rule rather than rolling back immutable
  publication rows; disable provider-backed prose/extraction independently.

## Alerting

Alert on oldest pending job age, poison-job rate, provider error rate, report
generation failure rate, source staleness, and deletion receipts with outstanding
stores. Never include document text, salary, names, filenames, or spans.
