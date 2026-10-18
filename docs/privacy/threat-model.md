# Threat model (STRIDE summary)

| Surface                  | Threat                                                                  | Control                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload                   | Malware, polyglot, encrypted/active PDF, zip bomb, oversized page count | Signature/MIME check, size cap, policy/ClamAV scan, active-content rejection, 40-page limit before extraction                                              |
| Parser sandbox           | Escape, resource exhaustion, network egress                             | Adapter interface; production runs parser in isolated, no-network, read-only, non-root container with CPU/memory/time/file limits (deployment requirement) |
| Prompt injection         | Document text asks model to change rules, call tools, exfiltrate        | Providers receive quoted untrusted pages; tools/browsing/memory disabled; output schema/span validation; provider disabled until contracts verified        |
| Tenant isolation         | Guessed UUID, cross-user reads                                          | `user_id` in every authoritative query, indistinguishable 404, tenant helpers, integration tests                                                           |
| Signed links             | Token leakage, indexing, replay                                         | 256-bit random tokens stored only as hashes, 7-day expiry, view-only, `noindex` metadata, immediate revocation                                             |
| Worker leases            | Duplicate work, late provider result                                    | `FOR UPDATE SKIP LOCKED`, version checks before commit, stale results discarded, cancellation wins                                                         |
| Support/concierge access | Routine viewing, downloads                                              | No routine access; consented case assignment, least-privilege role, short-lived grant, audit, no download, auto-revoke                                     |
| Source ingestion         | SSRF/DNS rebinding, parser drift                                        | Approved HTTPS origins/paths, redirect/address validation, byte/time caps, checksum diff, four-eyes approval (production ingestion path)                   |
| Deletion races           | Late commit after deletion                                              | Synchronous version increment + access revocation, job cancellation, worker recheck with document lock, deletion-mode-only erasure                         |
| Logs/analytics           | Sensitive leakage                                                       | Allowlist telemetry, no body capture, redaction tests, operator views show only shortened IDs/codes                                                        |
| Backups                  | Deletion not truthful                                                   | Encrypted, region-bound, disclosed bounded window; crypto-erasure where supported                                                                          |

## Residual risks

- Column encryption covers raw text, filenames, and spans; confirmed facts and
  reports rely on volume encryption and least privilege. Production should add
  envelope-encrypted sensitive JSON or field-level encryption.
- The development identity adapter is not a production authentication system.
- The S3 adapter and ClamAV path are implemented but not exercised in CI.
- Rule fixtures are engineering seeds pending independent domain sign-off.
