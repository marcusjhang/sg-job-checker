---
status: approved-for-planning
product_owner: Marcus Jhang
employment_rules_owner: Pending appointment
privacy_owner: Pending appointment (DPO)
security_owner: Pending appointment
approved_at: 2026-10-18
supersedes: none
source: 2026-10-18 planning request (implementation plan + product brief reference)
---

# Singapore Job Offer Contract and Payslip Checker — Product Specification

> **Provenance note.** The 2026-10-18 planning request referenced a separately
> supplied product brief but transmitted only the implementation plan. This
> document reconstructs the product-level authority from that plan without
> weakening any exclusion, safety control, or validation threshold. The Product
> Owner must diff this file against the original brief before production use.
> This is a prototype, not legal, tax, or financial advice.

## 1. Goal

Turn a user-confirmed Singapore offer, employment contract, or (Phase 2) payslip
into a reproducible, calculation-backed report covering:

- compensation and take-home scenarios;
- CPF contributions with effective-dated rules;
- official wage context with limitations;
- Key Employment Terms (KET) completeness;
- scoped Employment Act rate/entitlement context;
- discrepancies and professional questions for HR.

Every money or compliance result is produced by deterministic, versioned code
from explicitly confirmed facts. Language models may extract, classify, explain,
and draft, but may never alter deterministic evidence.

## 2. Users and scope

Initial users are Singapore Citizens and Permanent Residents, age 20–45, in
English-language, monthly salaried, non-shift roles with basic monthly salary
approximately S$2,500–S$12,000.

Phase 1 supports offers and employment contracts through one pre-employment
fact/report flow. Payslip and compare-offers remain disabled “coming later”
controls until Phase 2 gates pass.

### Out of scope

Foreign-worker levies, work-pass eligibility, shift schedules, equity valuation,
commission-dominant roles, tax advice, non-compete enforceability, and outcome
prediction. No MyCareersFuture collection until access, reuse, and retention
rights are approved in writing.

## 3. Non-negotiable product rules

1. No monetary, benchmark, or compliance result before every critical extracted
   field is explicitly confirmed.
2. Deterministic code owns CPF, wage, entitlement, completeness, and discrepancy
   calculations.
3. Published rule and benchmark versions are immutable; corrections create new
   versions and historical reports remain reproducible.
4. Results distinguish confirmed document facts, user-entered facts,
   deterministic calculations, benchmark context, and interpretive observations.
5. Every evidence item records inputs, rule/algorithm version, steps, source URL,
   snapshot/checksum, effective date, applicability, and warnings.
6. Unsupported, encrypted, corrupt, active-content-bearing, or suspicious files
   never reach OCR or model providers.
7. Default raw-document retention: 24 hours after report generation, or seven
   days after upload when abandoned. Immediate user deletion is always available.
8. Default confirmed facts, evidence, and reports: 30 days after the latest
   report generation, then deleted through the same workflow. Export does not
   extend server retention.
9. Deletion synchronously revokes access and shares, cancels pending work, blocks
   late commits, and leaves only a non-sensitive receipt.
10. Never label a term “illegal” unless a reviewed deterministic rule explicitly
    supports that exact conclusion. Otherwise use “clarify” or “seek advice.”

## 4. Release slices

| Phase | Scope                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------- |
| 0     | Source registry, canonical schemas, evaluator fixtures, reviewer workflow, privacy/security foundations |
| 1A    | Staff-assisted offer/contract checker; 30-user validation build                                         |
| 1B    | Automated extraction, production hardening, source monitoring, failover                                 |
| 2     | Offer comparison, payslips, opt-in history and response tracking                                        |
| 3     | Separately approved expansions (shifts, retrenchment, multilingual, foreign workers)                    |

Payslip and comparison entry points are visible but disabled in Phase 1.

## 5. Validation thresholds (release-blocking)

- ≥95% key-field extraction accuracy after user confirmation.
- 100% pass of the reviewed rule catalogue; any material money error blocks
  launch regardless of averages.
- ≥30% of concierge participants intend to use the result for their next offer.
- Consolidated report preferred over raw contract / manual comparison.
- Repeatable channel evidence.
- Prompt-injection resistance and exercised privacy/deletion/incident controls.
- No open Critical or High security, privacy, accessibility, correctness, or
  architecture finding.

## 6. Data and provider commitments

- Singapore-only data residency for primary stores and backups.
- Providers must contractually prohibit training on customer documents and
  define a verified maximum retention window before production traffic.
- No request/response body capture in logs or analytics.
- Document text, salary, filenames, and source spans never appear in logs,
  analytics, notifications, support exports, or operator views.
- Concierge reviewer access requires consent, case assignment, least privilege,
  short-lived grants, audit, no download, and automatic revocation.

## 7. Accessibility and support matrix

WCAG 2.2 AA. Current and previous major versions of Chrome, Edge, Safari, and
Firefox. Keyboard, screen-reader, 200% zoom, forced-colors, and mobile layouts
are part of the release gate.

## 8. Traceability

| Product section                  | Implementation tasks |
| -------------------------------- | -------------------- |
| 1 Goal / deterministic authority | 1, 3, 9, 13, 19, 20  |
| 2 Scope / exclusions             | 5A, 16, 29–31        |
| 3.1 Confirmation gate            | 9, 10, 11            |
| 3.2 Deterministic calculators    | 14–18                |
| 3.3 Immutable versions           | 12, 13, 17, 22       |
| 3.4 Evidence classes             | 9, 19, 21            |
| 3.5 Evidence manifest            | 19                   |
| 3.6 Safe documents               | 6, 8, 10             |
| 3.7 Raw retention                | 5, 23                |
| 3.8 Derived retention            | 5, 23, 31            |
| 3.9 Deletion                     | 23                   |
| 3.10 Prohibited conclusions      | 16, 20               |
| 4 Release slices                 | 1, 28                |
| 5 Validation                     | 25, 26, 27           |
| 6 Provider/privacy               | 5, 20, 27            |
| 7 Accessibility                  | 21, 27               |
| 8 Traceability                   | 1                    |
