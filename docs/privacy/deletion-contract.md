# Deletion contract

## On request (synchronous transaction)

1. Authorize the owner; return indistinguishable `404` otherwise.
2. Increment `documents.version` and set `state = DELETION_PENDING`.
3. Revoke all shares (`revoked_at = now()`); share reads fail closed.
4. Mark pending/leased jobs for the subject `CANCELLED` with reason
   `SUBJECT_DELETED`.
5. Insert one idempotent deletion job keyed by the user's operation UUID.
6. User reads and exports cease immediately.

## Worker (version-checked)

Before every commit, reload and lock the document. If the state is no longer
`DELETION_PENDING` or the version changed, stop and mark the job
`CANCELLED_STALE`.

Delete, in order:

1. exact recorded object keys (raw, page images, exports);
2. page artefacts, scan findings, extraction revisions, extracted fields;
3. evidence, report dependencies, reports, generation requests;
4. occupation matches, confirmed revisions, document row;
5. provider deletion where an API is available, tracked by opaque provider ID.

Then insert a receipt containing a salted subject hash, timestamps, store
categories checked, and bounded outstanding backup/provider expiry. Receipts
never contain document ID, filename, content, salary, or share tokens.

## Bounded windows

- Primary stores: immediate removal after the workflow completes.
- Backups: disclosed maximum window; crypto-erasure where provider-supported.
- External provider: verified contractual maximum, shown before upload.

## Verification

The deletion runbook exercises objects, database rows, caches (if any), temp
files, logs, analytics, providers, shares, and exports. Partial failures retry
the exact outstanding stores; they never re-expose content.
