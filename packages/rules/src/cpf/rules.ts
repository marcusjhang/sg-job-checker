import type { CpfRuleFixture } from "./types";

/**
 * Reviewed fixture transcribed from:
 * - CPF, “How much CPF contributions to pay” (updated 2026-10-07)
 * - CPF, “CPF Contribution Changes from 1 January 2027” (2026-05-21)
 * - CPF, “What constitutes wages for CPF contributions” (OW ceiling example)
 *
 * Engineering fixture: the Employment Rules Owner must independently check and
 * sign every value before any production launch. See
 * docs/rules/cpf-implementation-notes.md.
 */
export const CPF_RULES: CpfRuleFixture[] = [
  {
    semanticVersion: "2026.1",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    owCeilingCents: 800_000,
    awCeilingCents: 10_200_000,
    fullRateWageFloorCents: 75_000,
    ageBands: [
      { transitionAge: null, label: "55 and below", employerBps: 1700, employeeBps: 2000 },
      { transitionAge: 55, label: "Above 55 to 60", employerBps: 1600, employeeBps: 1800 },
      { transitionAge: 60, label: "Above 60 to 65", employerBps: 1250, employeeBps: 1250 },
      { transitionAge: 65, label: "Above 65 to 70", employerBps: 900, employeeBps: 750 },
      { transitionAge: 70, label: "Above 70", employerBps: 750, employeeBps: 500 }
    ]
  },
  {
    semanticVersion: "2027.1",
    effectiveFrom: "2027-01-01",
    effectiveTo: null,
    owCeilingCents: 800_000,
    awCeilingCents: 10_200_000,
    fullRateWageFloorCents: 75_000,
    ageBands: [
      { transitionAge: null, label: "55 and below", employerBps: 1700, employeeBps: 2000 },
      { transitionAge: 55, label: "Above 55 to 60", employerBps: 1650, employeeBps: 1900 },
      { transitionAge: 60, label: "Above 60 to 65", employerBps: 1300, employeeBps: 1300 },
      { transitionAge: 65, label: "Above 65 to 70", employerBps: 900, employeeBps: 750 },
      { transitionAge: 70, label: "Above 70", employerBps: 750, employeeBps: 500 }
    ]
  }
];

export function cpfFixtureChecksum(fixture: CpfRuleFixture): string {
  return JSON.stringify(fixture);
}
