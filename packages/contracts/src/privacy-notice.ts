export const PRIVACY_POLICY_KEY = "job-checker-privacy-notice";
export const PRIVACY_NOTICE_VERSION = "1.0.0";
export const PRIVACY_NOTICE_EFFECTIVE_FROM = "2026-10-18T00:00:00.000Z";

export const PRIVACY_NOTICE_MARKDOWN = `# Privacy and retention notice (v1.0.0)

## Purpose

We turn a Singapore offer or employment contract you choose to submit into a
structured second opinion about pay, CPF, key employment terms, and official wage
context. This is not legal, tax, or financial advice, and it does not predict
whether an offer is “good” or whether a term is unlawful.

## What we collect

- The document you upload, or the facts you enter manually.
- Your confirmed corrections, the report, and evidence used to produce it.
- A confidential acceptance record proving you saw this notice.

## Processors and providers

Phase 1A uses a deterministic local extractor and a private object store. If an
external extraction or explanation provider is enabled, its contract must prohibit
training on your document and define a verified maximum retention period. The
provider register is part of our privacy inventory.

## No training

We do not permit providers to train models on your documents. We do not sell your
data.

## Redaction limits

We remove obvious NRIC and bank-account patterns before any external provider
call, but redaction is not perfect. Do not upload documents you are not authorised
to share. Never upload a document containing another person's sensitive data.

## Retention

- Raw document and page artefacts: deleted 24 hours after report generation, or
  7 days after upload if you abandon the workflow.
- Confirmed facts, evidence, and reports: deleted 30 days after the latest report
  generation.
- Exports are copies and do not extend server retention.
- Deletion is available immediately. We revoke access and shares synchronously,
  cancel pending work, and discard late provider results.
- Backups and external providers have a disclosed bounded window; crypto-erasure
  is used where supported.

## Your rights

You can access, export, correct, or delete your data in the product. For privacy
questions or complaints, contact the Data Protection Officer listed in the
application. You may also contact the Personal Data Protection Commission.

## Security

Documents are held in private storage with encryption in transit and at rest.
Support and concierge reviewers have no routine access. Any consented case review
uses a named, short-lived grant, is audited, and never permits downloads.

## Acceptance

By continuing, you confirm that you have read this notice and that you are
authorised to submit the document or facts.`;
