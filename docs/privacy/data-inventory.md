# Privacy data inventory

Owner: Privacy/DPO (pending). This inventory is the deploy-time record referenced
by ADR 0003. It must be approved before production traffic.

| Store                                                  | Data class                      | Region                    | Encryption                                                         | Access role                     | Purpose                        | Max retention                       |
| ------------------------------------------------------ | ------------------------------- | ------------------------- | ------------------------------------------------------------------ | ------------------------------- | ------------------------------ | ----------------------------------- |
| PostgreSQL `documents`, `document_pages`               | Restricted                      | SG                        | At-rest volume encryption; AES-256-GCM for page text and filenames | web, worker                     | Workflow state, reviewed text  | Raw: 24h post-report / 7d abandoned |
| PostgreSQL `confirmed_revisions`                       | Sensitive employment            | SG                        | At-rest volume encryption                                          | web, worker                     | Confirmed facts and provenance | 30d post-report                     |
| PostgreSQL `evidence`, `reports`                       | Sensitive employment            | SG                        | At-rest volume encryption                                          | web, worker                     | Reproducible outputs           | 30d post-report                     |
| PostgreSQL `audit_records`, `deletion_receipts`        | Operational / non-sensitive     | SG                        | At-rest                                                            | staff (read-only views), worker | Security and deletion proof    | 12 months (proposed)                |
| Object store `.data/objects` (dev) / private S3 (prod) | Restricted                      | SG                        | AES-256-GCM envelope; private bucket                               | worker, web                     | Raw uploads, page renderings   | 24h / 7d                            |
| Application logs                                       | Operational only                | SG                        | At-rest, allowlist fields                                          | operations                      | Debugging and SLOs             | 30 days                             |
| Traces/metrics                                         | Operational, bucketed           | SG                        | At-rest                                                            | operations                      | Performance                    | 30 days                             |
| Backups                                                | Restricted + sensitive          | SG                        | Encrypted, access-controlled                                       | break-glass only                | Recovery                       | Disclosed bounded window            |
| Sandbox temp                                           | Restricted                      | SG                        | Ephemeral disk                                                     | sandbox only                    | Parsing                        | Deleted on completion/crash         |
| OCR/model provider                                     | Restricted (provider-dependent) | Contracted SG or approved | Provider contract                                                  | provider                        | Extraction/explanation         | Verified contractual maximum        |
| Concierge reviewer grants                              | Restricted access               | SG                        | Short-lived grant                                                  | `CONCIERGE_REVIEWER`            | Case review                    | Case close / retention expiry       |

## Prohibited destinations

Document text, salary, filenames, NRIC/bank data, source spans, prompts, signed
URLs, and provider payloads are prohibited from logs, traces, analytics,
notifications, support exports, operator views, and developer fixtures.

## Provider register (summary)

| Provider                                 | Purpose                         | Training on documents                 | Max retention             | Status           |
| ---------------------------------------- | ------------------------------- | ------------------------------------- | ------------------------- | ---------------- |
| Deterministic local extractor (Phase 1A) | Text extraction                 | Not applicable (no external provider) | None                      | Active in dev    |
| Managed LLM provider                     | Phase 1B extraction/explanation | Contract must prohibit                | Must be verified ≤30 days | Not enabled      |
| ClamAV                                   | Malware scanning                | Not applicable                        | None (local)              | Adapter provided |
| Private object store                     | Raw object storage              | Not applicable                        | 24h/7d                    | Active in dev    |

Production traffic is blocked until each external provider's no-training and
retention terms are recorded and verified by Privacy and Security.
