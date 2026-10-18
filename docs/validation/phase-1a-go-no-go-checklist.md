# Launch checklist (Phase 1A)

## Automated gates

- [ ] `pnpm lint` clean.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm test` and `pnpm test:integration` green.
- [ ] `pnpm test:e2e` green on Chromium and mobile viewport.
- [ ] `pnpm audit:secrets` clean.
- [ ] `pnpm build` green on the release commit.
- [ ] Migration `0006` applied on a clean database and on a roll-forward database.
- [ ] Golden and adversarial suites pass with no material money error.

## Named sign-offs

- [ ] Product Owner.
- [ ] Employment Rules Owner (CPF, KET, Employment Act catalogue and wording).
- [ ] Privacy / DPO (notice, retention, provider register, deletion contract).
- [ ] Security (upload, sandbox, tenancy, secrets, incident response).
- [ ] Accessibility (WCAG 2.2 AA manual + automated).
- [ ] Operations (runbooks, SLOs, restore drill).
- [ ] Incident Response Commander.

No individual may approve their own high-risk rule ingestion and activation.

## Before upload is enabled

- [ ] Current privacy notice displayed and explicitly accepted.
- [ ] Raw retention (24h/7d), derived retention (30d), provider windows, and
      immediate deletion semantics are visible.
- [ ] External provider no-training and retention terms verified in writing.
- [ ] Concierge reviewer access workflow (consent, case grant, audit, no download,
      auto-revoke) exercised.
- [ ] Kill switches tested for uploads, extraction, generation, and each rule
      version.
- [ ] Support playbook and on-call rota staffed.
- [ ] First ten reports manually checked against source documents before delivery.

## Go/no-go

Any failed critical gate keeps the product concierge-only with the affected
function suspended and a reviewed corrective plan. Do not waive a gate.
