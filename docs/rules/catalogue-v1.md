# Rule catalogue v1

All rules are effective-dated, immutable once published, and backed by reviewed
source snapshots. Unsupported inputs produce `UNAVAILABLE` or `INDETERMINATE`
evidence, never a guessed value.

| Rule key                     | Scope                                          | Inputs                                                              | Output                                                       |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `cpf.contribution`           | CPF for citizens and PRs, monthly wages > $750 | citizenship/PR effective date, arrangement, DOB, wage period, OW/AW | employee/employer CPF, applicable wages, steps               |
| `compensation.guaranteed`    | Monthly and annual guaranteed cash             | confirmed components, CPF evidence                                  | contractual cash, take-home, annual guaranteed, employer CPF |
| `ket.completeness`           | KET item presence and applicability            | confirmed facts                                                     | per-item status and next action                              |
| `employment-act.coverage`    | Part IV coverage                               | role classification, basic salary                                   | applies / does not apply / indeterminate                     |
| `employment-act.rate-of-pay` | Monthly-rated hourly and daily rates           | basic salary, contractual hours                                     | exact-decimal rates                                          |
| `employment-act.overtime`    | Overtime applicability and pay                 | coverage, overtime hours, rate                                      | scoped evidence                                              |
| `employment-act.leave`       | Annual and sick leave context                  | service length, contractual benefit                                 | statutory context and discrepancy                            |
| `benchmark.occupation`       | Official wage context                          | selected occupation, snapshot                                       | percentiles, basis, limitations                              |

## Explicit exclusions

Shift scheduling, complex overtime scenarios, retrenchment/final pay, equity,
commission-dominant roles, tax, non-compete enforceability, and work-pass
eligibility are not in v1. The report says so rather than implying coverage.

## Publication gate

A rule version may be published only when:

1. a reviewer-approved source snapshot exists;
2. the implementation and fixture set are hashed;
3. every catalogue and boundary test passes;
4. an independent domain approver signs the scope, formulas, rounding, and
   user-facing wording;
5. effective dates do not overlap an existing version for the same key.
