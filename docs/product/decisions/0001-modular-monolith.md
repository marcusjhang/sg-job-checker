# ADR 0001 — Modular monolith plus PostgreSQL durable jobs

- Status: Accepted
- Date: 2026-10-18
- Approvers: Product Owner, Engineering

## Context

The product must atomically pin confirmed facts, rule versions, evidence, and a
final report. Uploads, extraction, deletion, and retention need retries and
isolation from request latency, but there is no evidenced need for distributed
domain boundaries at the initial scale (≤1,000 users, 100 uploads/day).

## Considered options

1. **Modular monolith + PostgreSQL durable jobs (adopted).** One transactional
   authority; separate web and worker processes from one repository.
2. **Synchronous-only monolith.** Rejected: parser/model latency, sandboxing, and
   retries do not fit request latency.
3. **Microservices + broker.** Rejected for MVP: distributed transactions, tenant
   propagation, deletion races, and operating cost without a scaling need.

## Decision

Ship a modular monolith with packages whose public contracts are explicit. Web
and worker are separately runnable processes sharing one PostgreSQL authority and
one private object store. Jobs are rows leased with `FOR UPDATE SKIP LOCKED`.

## Consequences

- Report generation can be one database transaction.
- Deletion and late-provider-result races are resolved with version checks.
- A module may later be extracted only when independent scaling or isolation is
  demonstrated; the public contract is the seam.

## Reversal trigger

Extraction or report rendering needs independent scaling that separate worker
processes cannot provide, or a module needs a different runtime/security domain.
