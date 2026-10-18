# Singapore Job Checker

A Singapore-specific assistant that turns a user-confirmed offer or employment
contract into a reproducible, calculation-backed report: compensation, CPF,
official wage context, Key Employment Terms, scoped Employment Act context,
discrepancies, and professional questions for HR.

> **Prototype status.** This repository is a working Phase 1A prototype, not a
> production launch. The CPF/MOM rule fixtures are engineering seeds pending
> independent employment-domain sign-off. The benchmark snapshot is clearly
> labelled demonstration data, not official MOM statistics. Legal, tax, and
> financial advice is out of scope.

## What is implemented

- Next.js 16 App Router + React 19 web app and a separately runnable worker.
- PostgreSQL 17 authority with checked-in migrations, tenant-scoped queries,
  immutable revisions/reports, and version-safe durable jobs.
- Versioned privacy notice and explicit acceptance before document creation.
- Scope screening with documented salary policy and official referrals.
- Private upload intents, encrypted-at-rest object storage, malware/active-content
  policy scanning, and manual entry without an object.
- Deterministic PDF text extraction with literal, evidence-bound proposals; every
  critical field must be explicitly confirmed.
- Deterministic CPF (2026 + published 2027), compensation, KET, Employment Act
  rates/overtime/leave, and benchmark modules with effective-dated rule rows.
- Atomic report generation, evidence graph, pinned sources, PDF export, expiring
  revocable shares, HR draft, correction/supersession, and race-safe deletion.
- Unit, property-style, integration (real PostgreSQL), and Playwright browser
  tests, including axe accessibility checks.

## Quickstart

Requirements: Node.js 22 LTS, pnpm 10, Docker (for PostgreSQL).

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev                 # web on http://127.0.0.1:3000
pnpm dev:worker          # in a second terminal
```

Sign in with any email (development identity adapter). The email is your private
workspace key. `STAFF_EMAILS` controls the staff pages.

Run the gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm audit:secrets
pnpm build
```

The E2E runner starts PostgreSQL (compose), migrates/seeds, starts the worker and
web app on port 3100, and drives Chromium and a mobile viewport.

## Architecture

```text
apps/web        Next.js UI, route handlers, auth boundary
apps/worker     durable-job poller and sandbox/provider adapters
packages/       contracts, db, identity, documents, extraction, rules,
                benchmarks, reports, explanations, audit, observability
fixtures/       synthetic documents and rule/benchmark fixtures
docs/           product authority, ADRs, privacy, rules, operations, validation
```

One PostgreSQL authority. Jobs are rows leased with `FOR UPDATE SKIP LOCKED`.
Report generation is one transaction that pins the confirmed revision, rule
versions, source snapshots, benchmark snapshot, and evidence. Providers may
extract, classify, explain, and draft; they never write authoritative numbers or
applicability decisions. Unresolved inputs become `UNAVAILABLE` or
`INDETERMINATE`, never a guess.

## Privacy and retention defaults

- Raw document/page artefacts: 24 hours after report generation; 7 days after
  abandoned upload; immediate user deletion.
- Confirmed facts, evidence, and reports: 30 days after latest generation.
- Shares: 7-day expiry, immediate revocation.
- Deletion revokes access/shares synchronously, cancels jobs, discards late
  provider results, and leaves only a non-sensitive receipt.

See `docs/privacy/` and the in-app notice.

## Known limitations (deliberate)

- Development identity adapter only; production OIDC is an interface, not wired.
- Local encrypted object store by default; S3 adapter present but unverified.
- ClamAV adapter present; default dev scanning is a conservative policy scanner.
- Image OCR is not enabled; image-only uploads go to manual entry.
- Graduated first/second-year PR CPF rates require official Table 2/3 fixtures
  that are not approved in this release; such cases yield `UNAVAILABLE`.
- Benchmark data is demonstration-only until an approved official snapshot is
  ingested.
- Payslip and compare-offers entry points are disabled Phase 2 controls.

## License

MIT.
