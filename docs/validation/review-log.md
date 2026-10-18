# Independent review log

Tooling: `ocr delegate preview` / `ocr delegate rule` (workspace and commit-range
modes) followed by host-agent review, fixes, and reruns.

## Pass 1 — core lifecycle, money, and privacy

Reviewed: migrations, tenant/job helpers, upload/storage/deletion, extraction,
CPF/compensation/KET/Employment Act, report generation/render/PDF/share,
identity/proxy, API handlers, worker handlers.

| Severity | Finding                                                                                               | Resolution                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| High     | Raw-artefact purge nulled `retention_expires_at`, so 30-day derived-data deletion never ran.          | Preserve the report retention date; purge only raw pages/spans/objects.                    |
| High     | Paid sick leave before 6 months was understated (showed 0 instead of MOM pro-rata 5/15, 8/30, 11/45). | Implement 3–5 month pro-rata and 6+ month 14/60.                                           |
| High     | Non-workman overtime used the uncapped hourly rate, contrary to the S$13.60 cap context.              | Cap the overtime hourly context at S$13.60 and warn.                                       |
| High     | Excluded reimbursements entered guaranteed compensation totals.                                       | Exclude `EXCLUDED` earnings from guaranteed cash, CPF, and annual totals; show separately. |
| High     | Formula-based guaranteed components were silently omitted.                                            | Exclude with a clarification instead of inventing a value.                                 |
| High     | Confirmed facts had no per-field provenance.                                                          | Server-derived DOCUMENT/USER provenance with extraction revision/page where values match.  |
| High     | Development sign-in and placeholder secrets could run in production.                                  | Runtime production guard plus CSRF/origin check on dev sign-in.                            |
| High     | Concurrent uploads could delete the winning object.                                                   | Row lock the intent, write, then commit; second writer is rejected before writing.         |
| High     | A new share could be created while deletion was pending.                                              | Share creation requires a non-deleting document.                                           |
| High     | Operator retry requeued a job before checking the allowlist.                                          | Authorize kind and state before mutation.                                                  |
| High     | Sign-in `next` parameter allowed `//host` open redirect.                                              | Reject protocol-relative targets.                                                          |
| High     | PDF parsing ran in the worker process.                                                                | Separate child process, 20s timeout, output cap, sanitised stdout, no temp file.           |
| High     | Re-delivered scan/extraction jobs could duplicate findings or extraction work.                        | Integrity checksum, existing-finding check, deterministic extraction occurrence key.       |
| High     | Regeneration did not supersede the previous current report.                                           | Supersede generated reports in the same transaction before inserting the new version.      |
| High     | KET overtime items were “missing” when the Employment Act role was unknown.                           | `INDETERMINATE` plus a targeted clarification.                                             |
| Medium   | No `Cache-Control: no-store` on sensitive pages.                                                      | Proxy sets no-store for app/report/share/API paths.                                        |
| Medium   | Benchmark rule version was not a dependency.                                                          | Pin and record the benchmark rule version in the manifest/dependencies.                    |
| Medium   | AWS/bonus CPF was not explicitly excluded from the monthly estimate.                                  | Add an evidence warning about the Additional Wage ceiling.                                 |
| Medium   | Salary/age scope could be bypassed by a direct API client.                                            | Enforce the S$2,000–S$15,000 and adult-age bounds at confirmation.                         |
| Medium   | GitHub Actions were tag-pinned.                                                                       | Pin checkout, setup-node, and pnpm actions by commit SHA.                                  |

## Pass 2 — re-review after fixes

Re-ran preview/rules over the changed and still-core files (migrations, jobs,
upload, deletion, generation, identity, worker, proxy, contracts) and reran all
gates. No new Critical or High finding remains open in the prototype scope.

## Known production gaps (release blockers, not prototype defects)

- OIDC is an interface, not wired; only the guarded development adapter exists.
- Official source capture/staleness monitoring and four-eyes ingestion are seeded,
  not operational.
- External extraction/explanation providers are disabled until no-training and
  retention contracts are verified.
- Parser isolation is process-level with timeout; production still requires a
  no-network container, seccomp/AppArmor, and resource limits.
- S3 and ClamAV adapters are implemented but not exercised in CI.
- Confirmed facts/reports rely on volume encryption, not field-level encryption.
- CPF/KET/Employment Act fixtures and the demo benchmark require independent
  Employment Rules Owner and Privacy sign-off before production.

Gate evidence: `pnpm lint`, `pnpm typecheck`, `pnpm test` (64), `pnpm
test:integration` (21), `pnpm test:e2e` (5 passed, 1 desktop-only keyboard skip),
`pnpm build`, `pnpm audit:secrets`, `pnpm audit --prod`, `psf validate`.
