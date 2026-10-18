import { sgd, type ConfirmedEmploymentFactsV1 } from "@job-checker/contracts";
import type { Actor } from "@job-checker/identity";

export function makeFacts(
  overrides: Partial<ConfirmedEmploymentFactsV1> = {}
): ConfirmedEmploymentFactsV1 {
  return {
    documentKind: "OFFER",
    employeeResidency: "CITIZEN",
    cpfContributionArrangement: "FULL_STANDARD",
    dateOfBirth: "1992-05-15",
    compensationPeriod: "2026-11",
    basicMonthlySalary: sgd(600_000),
    compensationComponents: [],
    employer: { legalName: "Acme Pte Ltd" },
    employeeName: "Alex Tan",
    jobTitle: "Software Developer",
    duties: ["Build and maintain software", "Review code and APIs"],
    employmentActRoleClassification: "NON_WORKMAN",
    startDate: "2026-12-01",
    employmentDuration: { kind: "PERMANENT" },
    workingHoursPerDay: "8",
    workingDaysPerWeek: "5",
    restDay: "Saturday",
    salaryPeriod: "Monthly",
    leave: { annual: "14 days", sick: "14 days", hospitalisation: "60 days" },
    medicalBenefits: "Outpatient and hospitalisation insurance",
    probation: "3 months",
    noticePeriod: "1 month",
    placeOfWork: "Singapore",
    provenance: {},
    ...overrides
  };
}

export function makeActor(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    authSubject: "alex@example.com",
    displayName: "Alex Tan",
    isStaff: false,
    ...overrides
  };
}
