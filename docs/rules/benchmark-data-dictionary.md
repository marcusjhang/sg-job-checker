# Benchmark data dictionary

## Snapshot semantics

A benchmark snapshot is immutable and always displayed with its dataset key,
version, effective date, wage basis, coverage, and limitation text. Rows from two
source editions are never mixed under one snapshot ID.

## Fields

| Field                                    | Meaning                                                       |
| ---------------------------------------- | ------------------------------------------------------------- |
| `occupation_code`                        | Source classification code                                    |
| `title`                                  | Source occupation title                                       |
| `industry_code`                          | Source industry code, nullable                                |
| `p25_cents`, `median_cents`, `p75_cents` | Gross monthly wage percentiles in integer cents               |
| `wage_basis`                             | e.g. `GROSS_MONTHLY_INCLUDING_BONUS`                          |
| `coverage`                               | JSON: employee coverage, exclusions, source edition           |
| `limitations`                            | Displayed adjacent to the comparison, not hidden in a tooltip |

## Seeded demonstration data

The prototype seeds a clearly labelled `DEMO_FIXTURE` snapshot for end-to-end
testing. It is **not** official MOM statistics and every report that uses it says
so. Production ingestion must replace it with a licensed/approved official
snapshot and human review. Structural errors reject the whole candidate snapshot.

## Matching

Candidates are derived from title, duties, seniority signals, and industry. The
matcher returns up to five candidates with matched signals and a confidence
label (`HIGH`, `MEDIUM`, `LOW`). `HIGH` may preselect but still requires explicit
user confirmation. No candidate permits “none fits,” which makes benchmark
evidence unavailable without blocking other sections.
