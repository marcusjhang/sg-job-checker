# ADR 0003 — Retention and deletion defaults

- Status: Accepted
- Date: 2026-10-18
- Approvers: Product Owner, Privacy/DPO (pending), Security (pending)

## Context

The service handles raw employment documents and sensitive salary data. Users
need a truthful deletion story that distinguishes immediate access revocation
from bounded backup and provider expiry.

## Decision

| Data                                   | Default                                                   | User action                                |
| -------------------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| Raw document object and page artefacts | 24h after report generation; 7d after upload if abandoned | Immediate deletion                         |
| Confirmed facts, evidence, reports     | 30d after latest report generation                        | Immediate deletion; export does not extend |
| Active shares                          | 7d expiry                                                 | Immediate revocation                       |
| Deletion receipt                       | Non-sensitive salted hash, stores checked, timestamps     | Retained per audit policy                  |
| Backups                                | Bounded disclosed window; crypto-erasure where available  | Not user-addressable                       |

Deletion synchronously revokes access and shares, increments the document
version, cancels pending/leased jobs, and inserts a deletion job. Workers recheck
the version before every commit and discard late provider results. Only
non-sensitive receipts remain. “Immediate deletion” means immediate access
revocation and primary-store removal, with the disclosed bounded backup/provider
window shown before upload.

Both periods are deploy-time configuration recorded in the privacy inventory. A
change requires product and privacy approval. Extended history is Phase 2 opt-in
with a new policy version.

## Consequences

- Backups and provider retention must make the published maximum window truthful.
- Export is a copy; it cannot extend server retention.
- Deletion from every state, including mid-extraction, is a tested path.

## Reversal trigger

A legal retention requirement or an approved Phase 2 opt-in policy supersedes
this ADR through a new versioned policy, never by silent configuration drift.
