# Runbooks

## Failed job repair

1. Open `/operations` as staff. Identify the job by shortened ID and stable error code.
2. Retry only allowlisted kinds (`SCAN_DOCUMENT`, `EXTRACT_DOCUMENT`, `DELETE_DOCUMENT`,
   `EXPIRE_RETENTION`) with a written reason. The retry is audited and cannot change
   payload, tenant, or subject version.
3. If retries exhaust, inspect the subject state and typed error. Never edit job payloads
   or copy document content into tickets, chat, or logs.
4. For a stuck upload, delete the document and let the user re-upload or use manual entry.

## Source outage or drift

1. Stop new generation for the affected rule key only; unaffected evidence may proceed
   with a partial-coverage banner.
2. Capture the official artefact, checksum, response metadata, and diff. Do not activate
   content automatically.
3. Obtain four-eyes approval. Publish a new immutable source/rule version; never edit an
   approved row.
4. Mark affected reports through dependency impact. Do not rewrite report content.

## Provider outage

1. Disable provider-backed extraction/explanation with the feature flag.
2. Preserve manual entry and deterministic reporting where safe.
3. Confirm no request is retried with a stale document version; late results are discarded.
4. Record provider request IDs and the retention window; never paste document text.

## Incident response

- Commander: named on-call.
- Contain: revoke shares, suspend the rule or provider, disable uploads if needed.
- Assess: affected report IDs only; hash IDs in notes.
- Correct: publish a successor rule/source version and correction banner.
- Notify: follow the approved privacy/incident matrix.
- Recover: restore from a tested backup, verify deletion expiry, and close with evidence.

## Backup and restore drill

Restore into an isolated environment, verify encrypted columns and immutable versions,
measure RPO/RTO, and confirm that deleted content does not reappear beyond the disclosed
backup window. Record only counts and versions in the evidence file.
