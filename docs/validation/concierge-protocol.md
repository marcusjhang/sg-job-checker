# Concierge protocol and evaluation

## Recruitment

At least 30 consented Singapore Citizen/PR participants, age 20–45, monthly
salaried, non-shift, English documents, S$2,500–S$12,000. Quotas span
citizen/PR contribution years, age bands, occupation/industry, offer/contract
formats, scan quality, and straightforward vs ambiguous terms. Do not collect
protected attributes without an approved purpose and consent.

## Reviewer access

- Two trained annotators independently label critical fields, provenance, KET
  presence, occupation candidates, and expected calculations.
- A domain reviewer adjudicates disagreements before model evaluation.
- Reviewer access requires case assignment, `CONCIERGE_REVIEWER` least privilege,
  a short-lived grant, stated reason, audit record, no local download, and
  automatic revocation at case close or retention expiry.

## Metrics

Critical-field recall, exact normalized value accuracy, status classification,
page provenance, user correction rate, occupation top-1 acceptance and top-5
coverage, time to useful finding, citation coverage, and intended next-offer use.

## Gates

- ≥95% key-field accuracy after confirmation.
- 100% reviewed rule catalogue pass; no material money error.
- ≥30% intended next-offer use.
- Consolidated report preferred over raw contract/manual comparison.
- Repeatable channel evidence.
- Prompt-injection resistance and exercised privacy/deletion/incident controls.

Report per-field and worst-slice results; never mask a material error behind an
average. One material calculation error blocks launch.

## Gate report

Publish cohort, versions, methods, deviations, results, failures, and a signed
go/no-go decision. Never include participant documents or raw sensitive data.
