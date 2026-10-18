# Golden examples

These cases are executable (unit/integration/E2E) and release-blocking.

| Case                         | Expected                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Clean offer                  | Explicit confirmation, atomic report, pinned rule/source/snapshot versions, visible limitations and sources      |
| S$8,000 → S$6,000 correction | Old report `SUPERSEDED`; new confirmation creates a revision; new report v2; every total uses S$6,000            |
| Ambiguous bonus              | Guaranteed totals exclude it; clarification question asks whether it is contractual or discretionary             |
| Rule update after generation | Historical report reproduces; affected report is superseded by dependency; content is never rewritten            |
| Deletion during extraction   | Access and shares revoked; jobs cancelled; late provider result discarded; content erased; non-sensitive receipt |
| Upload + scan + extract      | Clean PDF reaches review; encrypted/active/malware PDFs never reach extraction                                   |

## Adversarial coverage

- Cross-tenant document and report IDs.
- Prompt injection inside document text.
- Malware/active-content/encrypted PDF fixtures.
- Unsupported/extra extraction fields, missing page citation, out-of-span value.
- Amount/citation validation in explanations.
- Duplicate operation keys and late jobs.
- CPF age/PR/ceiling/rounding boundaries and 2026/2027 selection.
- Source/rule unavailability producing partial coverage rather than a guess.

## Current evidence

`pnpm test` (59 tests), `pnpm test:integration` (20 tests), and
`pnpm test:e2e` (browser flows, axe checks) pass locally. Concierge metrics
(≥30 participants, ≥95% post-confirmation field accuracy, ≥30% intended use)
have not been collected; they remain launch gates.
