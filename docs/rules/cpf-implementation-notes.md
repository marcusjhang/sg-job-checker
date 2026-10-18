# CPF implementation notes

## Implemented effective periods

| Period                  | OW ceiling | Rates (≤55 / >55–60 / >60–65 / >65–70 / >70) |
| ----------------------- | ---------- | -------------------------------------------- |
| 2026-01-01 → 2026-12-31 | S$8,000    | 17/20, 16/18, 12.5/12.5, 9/7.5, 7.5/5        |
| 2027-01-01 →            | S$8,000    | 17/20, 16.5/19, 13/13, 9/7.5, 7.5/5          |

Sources: CPF “How much CPF contributions to pay” (updated 2026-10-07) and
“CPF Contribution Changes from 1 January 2027” (2026-05-21). OW ceiling S$8,000
per the CPF wage-classification page example; the Additional Wage ceiling is
S$102,000 minus total OW subject to CPF for the calendar year.

## Rounding

- Contributions are computed on Total Wages subject to CPF.
- Total CPF is rounded to the nearest dollar (≥50 cents rounds up).
- The employee's share has cents dropped (floor).
- The employer's share is the rounded total minus the truncated employee share.
- Money and rates use integer cents and scaled integers; never binary floating
  point.

## Age and PR transitions

- Age band changes on the first day of the month after the 55th/60th/65th/70th
  birthday, evaluated on `Asia/Singapore` civil dates.
- PR year 1 starts on the conversion date; year 2 starts on the first day of the
  month after the first anniversary; year 3 starts on the first day of the month
  after the second anniversary.

## Supported arrangements

- Citizens: full standard rates.
- PR year 3+: full standard rates.
- PR year 1/2: full standard rates and “full employer, full employee” are
  supported. Graduated employee rates require the official Table 2/3 fixtures;
  without them the result is `UNAVAILABLE` with a clarification action. This is
  deliberate: the prototype does not invent graduated rates.

## Known prototype limitations

- Monthly wages at or below S$750 (phased-in bands) are out of the initial user
  scope and return `UNAVAILABLE`.
- Year-to-date additional wages are required for the AW ceiling when AW is
  present; the confirmation flow asks for it.
- The checked-in fixtures are engineering fixtures. The Employment Rules Owner
  must independently transcribe and sign them against the captured official
  tables before any production launch.
