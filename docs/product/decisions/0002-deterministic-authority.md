# ADR 0002 — Deterministic authority for money and compliance

- Status: Accepted
- Date: 2026-10-18
- Approvers: Product Owner, Employment Rules Owner (pending)

## Context

Language models are useful for extraction and explanation but are not
reproducible, cannot be audited at the step level, and can silently invent
amounts or legal conclusions.

## Considered options

1. **Model computes and explains (rejected).** Non-reproducible, unsafe.
2. **Model proposes, deterministic code decides (adopted).** Extraction returns
   schema-constrained proposals. Confirmed facts are immutable. Effective-dated
   rule modules compute money and applicability with integer cents and exact
   decimals. Explanations may only restate validated evidence.

## Decision

Every monetary, benchmark, completeness, and discrepancy output is produced by
versioned deterministic code from confirmed facts and pinned rules/sources.
Models never write authoritative numbers, applicability decisions, or “illegal”
conclusions. Unsupported or unresolved inputs yield typed `UNAVAILABLE` or
`INDETERMINATE` evidence rather than a guess.

## Consequences

- Rule fixtures and boundary tests are release-blocking.
- All outputs carry rule/source versions and calculation steps.
- Explanations require amount/citation allowlists and deterministic fallback.

## Reversal trigger

None for authoritative outputs. A future model may propose a rule, but a human
reviewer must publish it as deterministic code with fixtures.
