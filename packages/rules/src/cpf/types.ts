export type CpfAgeBand = {
  label: string;
  employerBps: number;
  employeeBps: number;
};

export type CpfRuleFixture = {
  semanticVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  owCeilingCents: number;
  awCeilingCents: number;
  fullRateWageFloorCents: number;
  ageBands: {
    transitionAge: number | null;
    label: string;
    employerBps: number;
    employeeBps: number;
  }[];
};

export type CpfInput = {
  residency: "CITIZEN" | "PR";
  prStatusEffectiveDate?: string;
  arrangement:
    | "FULL_STANDARD"
    | "GRADUATED_STANDARD"
    | "FULL_EMPLOYER_GRADUATED_EMPLOYEE"
    | "FULL_EMPLOYER_FULL_EMPLOYEE"
    | "UNKNOWN";
  dateOfBirth: string;
  wagePeriod: string;
  ordinaryWagesCents: number;
  additionalWagesCents: number;
  ytdOrdinaryWagesCents?: number;
  ytdAdditionalWagesCents?: number;
};

export type CpfResult = {
  ageBandLabel: string;
  prYear: 1 | 2 | 3;
  arrangementApplied: "FULL_STANDARD" | "UNAVAILABLE_GRADUATED";
  ordinaryWagesSubjectCents: number;
  additionalWagesSubjectCents: number;
  totalWagesSubjectCents: number;
  totalContributionCents: number;
  employeeContributionCents: number;
  employerContributionCents: number;
  totalRateBps: number;
  employeeRateBps: number;
  employerRateBps: number;
  owCeilingCents: number;
  awCeilingCents: number;
  awRoomCents: number;
  rounding: string;
};
