"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseMoneyToCents } from "@job-checker/contracts/money";
import { apiFetch } from "@/lib/client";

type Extracted = {
  fieldKey: string;
  value: unknown;
  status: string;
  confidence: number | null;
  page: number | null;
  sourceSpan: string | null;
};

type ComponentForm = {
  key: string;
  label: string;
  amount: string;
  cadence: "MONTHLY" | "ANNUAL" | "ONE_OFF" | "FORMULA";
  guarantee: "GUARANTEED" | "DISCRETIONARY" | "INDETERMINATE";
  direction: "EARNING" | "DEDUCTION";
  cpfWageClass: "ORDINARY_WAGE" | "ADDITIONAL_WAGE" | "EXCLUDED" | "NEEDS_REVIEW";
};

type FormState = {
  kind: "OFFER" | "CONTRACT";
  residency: "CITIZEN" | "PR";
  prDate: string;
  arrangement:
    | "FULL_STANDARD"
    | "GRADUATED_STANDARD"
    | "FULL_EMPLOYER_GRADUATED_EMPLOYEE"
    | "FULL_EMPLOYER_FULL_EMPLOYEE"
    | "UNKNOWN";
  dob: string;
  period: string;
  salary: string;
  employer: string;
  employee: string;
  title: string;
  duties: string;
  role: "WORKMAN" | "NON_WORKMAN" | "MANAGER_EXECUTIVE" | "UNKNOWN";
  industry: string;
  startDate: string;
  duration: "PERMANENT" | "FIXED_TERM";
  endDate: string;
  hours: string;
  days: string;
  restDay: string;
  salaryPeriod: string;
  otPeriod: string;
  otRate: string;
  leaveAnnual: string;
  leaveSick: string;
  leaveHosp: string;
  medical: string;
  probation: string;
  notice: string;
  place: string;
  components: ComponentForm[];
};

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  return "";
}

function moneyValue(value: unknown): string {
  if (value && typeof value === "object" && "cents" in value) {
    const cents = Number((value as { cents: unknown }).cents);
    return Number.isInteger(cents) ? (cents / 100).toFixed(2) : "";
  }
  if (typeof value === "string") return value;
  return "";
}

function buildInitial(props: {
  documentKind: "OFFER" | "CONTRACT";
  extracted: Extracted[];
}): FormState {
  const map = new Map(props.extracted.map((field) => [field.fieldKey, field.value]));
  const durationValue = map.get("employmentDuration");
  const duration =
    durationValue && typeof durationValue === "object" && "kind" in durationValue
      ? (durationValue as { kind: string; endDate?: string })
      : null;
  const leave = map.get("leave") as Record<string, string> | undefined;
  const overtime = map.get("overtime") as Record<string, string> | undefined;
  return {
    kind: props.documentKind,
    residency: (map.get("employeeResidency") as "CITIZEN" | "PR" | undefined) ?? "CITIZEN",
    prDate: stringValue(map.get("prStatusEffectiveDate")),
    arrangement:
      (map.get("cpfContributionArrangement") as FormState["arrangement"] | undefined) ??
      "FULL_STANDARD",
    dob: stringValue(map.get("dateOfBirth")),
    period: stringValue(map.get("compensationPeriod")),
    salary: moneyValue(map.get("basicMonthlySalary")),
    employer: stringValue(map.get("employer.legalName")),
    employee: stringValue(map.get("employeeName")),
    title: stringValue(map.get("jobTitle")),
    duties: Array.isArray(map.get("duties"))
      ? (map.get("duties") as string[]).join("\n")
      : stringValue(map.get("duties")),
    role:
      (map.get("employmentActRoleClassification") as FormState["role"] | undefined) ??
      "NON_WORKMAN",
    industry: stringValue(map.get("industryDescription")),
    startDate: stringValue(map.get("startDate")),
    duration: duration?.kind === "FIXED_TERM" ? "FIXED_TERM" : "PERMANENT",
    endDate: duration?.endDate ?? "",
    hours: stringValue(map.get("workingHoursPerDay")),
    days: stringValue(map.get("workingDaysPerWeek")),
    restDay: stringValue(map.get("restDay")),
    salaryPeriod: stringValue(map.get("salaryPeriod")),
    otPeriod: stringValue(map.get("overtime.period") ?? overtime?.period),
    otRate: stringValue(map.get("overtime.rate") ?? overtime?.rate),
    leaveAnnual: stringValue(map.get("leave.annual") ?? leave?.annual),
    leaveSick: stringValue(map.get("leave.sick") ?? leave?.sick),
    leaveHosp: stringValue(map.get("leave.hospitalisation") ?? leave?.hospitalisation),
    medical: stringValue(map.get("medicalBenefits")),
    probation: stringValue(map.get("probation")),
    notice: stringValue(map.get("noticePeriod")),
    place: stringValue(map.get("placeOfWork")),
    components: []
  };
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "component"
  );
}

function buildFacts(form: FormState): Record<string, unknown> {
  const salaryCents = parseMoneyToCents(form.salary);
  const fieldErrors: string[] = [];
  if (salaryCents === null || salaryCents < 0)
    fieldErrors.push("Basic monthly salary must be a valid SGD amount.");
  if (!/^\d{4}-\d{2}$/.test(form.period)) fieldErrors.push("Compensation period must be YYYY-MM.");
  if (form.duration === "FIXED_TERM" && !form.endDate)
    fieldErrors.push("Fixed-term contracts need an end date.");
  if (form.components.some((component) => parseMoneyToCents(component.amount) === null)) {
    fieldErrors.push("Every compensation component needs a valid amount.");
  }
  if (form.components.some((component) => !component.label.trim())) {
    fieldErrors.push("Every compensation component needs a label.");
  }
  if (fieldErrors.length > 0) throw new Error(fieldErrors[0]);

  const components = form.components.map((component) => ({
    key: component.key || slug(component.label),
    label: component.label.trim(),
    amount: { currency: "SGD", cents: parseMoneyToCents(component.amount) ?? 0 },
    cadence: component.cadence,
    guarantee: component.guarantee,
    direction: component.direction,
    cpfWageClass: component.cpfWageClass
  }));

  const facts: Record<string, unknown> = {
    documentKind: form.kind,
    employeeResidency: form.residency,
    cpfContributionArrangement: form.arrangement,
    dateOfBirth: form.dob,
    compensationPeriod: form.period,
    basicMonthlySalary: { currency: "SGD", cents: salaryCents ?? 0 },
    compensationComponents: components,
    employer: { legalName: form.employer.trim() },
    employeeName: form.employee.trim(),
    jobTitle: form.title.trim(),
    duties: form.duties
      .split("\n")
      .map((line) => line.replace(/^[-•\d.\s]+/, "").trim())
      .filter(Boolean),
    employmentActRoleClassification: form.role,
    startDate: form.startDate,
    employmentDuration:
      form.duration === "PERMANENT"
        ? { kind: "PERMANENT" }
        : { kind: "FIXED_TERM", endDate: form.endDate },
    provenance: {}
  };
  if (form.prDate) facts.prStatusEffectiveDate = form.prDate;
  if (form.industry.trim()) facts.industryDescription = form.industry.trim();
  if (form.hours) facts.workingHoursPerDay = form.hours;
  if (form.days) facts.workingDaysPerWeek = form.days;
  if (form.restDay) facts.restDay = form.restDay;
  if (form.salaryPeriod) facts.salaryPeriod = form.salaryPeriod;
  const overtime: Record<string, string> = {};
  if (form.otPeriod) overtime.period = form.otPeriod;
  if (form.otRate) overtime.rate = form.otRate;
  if (Object.keys(overtime).length > 0) facts.overtime = overtime;
  const leave: Record<string, string> = {};
  if (form.leaveAnnual) leave.annual = form.leaveAnnual;
  if (form.leaveSick) leave.sick = form.leaveSick;
  if (form.leaveHosp) leave.hospitalisation = form.leaveHosp;
  if (Object.keys(leave).length > 0) facts.leave = leave;
  if (form.medical) facts.medicalBenefits = form.medical;
  if (form.probation) facts.probation = form.probation;
  if (form.notice) facts.noticePeriod = form.notice;
  if (form.place) facts.placeOfWork = form.place;
  return facts;
}

const CORE_KEYS = [
  "documentKind",
  "employeeResidency",
  "cpfContributionArrangement",
  "dateOfBirth",
  "compensationPeriod",
  "basicMonthlySalary",
  "employer.legalName",
  "employeeName",
  "jobTitle",
  "duties",
  "employmentActRoleClassification",
  "startDate",
  "employmentDuration",
  "compensationComponents",
  "workingHoursPerDay",
  "workingDaysPerWeek"
];

export function ReviewForm(props: {
  documentId: string;
  documentKind: "OFFER" | "CONTRACT";
  state: string;
  extractionRevisionId: string | null;
  extracted: Extracted[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => buildInitial(props));
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [busy, setBusy] = useState(false);

  const extractedMap = useMemo(
    () => new Map(props.extracted.map((field) => [field.fieldKey, field])),
    [props.extracted]
  );

  const criticalKeys = useMemo(() => {
    const keys = [...CORE_KEYS];
    if (form.residency === "PR") keys.push("prStatusEffectiveDate");
    if (form.duration === "FIXED_TERM") keys.push("employmentDuration.endDate");
    for (const component of form.components) {
      keys.push(`compensationComponents.${component.key}.cpfWageClass`);
      keys.push(`compensationComponents.${component.key}.guarantee`);
    }
    return keys;
  }, [form.residency, form.duration, form.components]);

  function update<K extends keyof FormState>(key: K, value: FormState[K], critical?: string) {
    setForm((current) => ({ ...current, [key]: value }));
    if (critical) {
      setConfirmed((current) => {
        const next = new Set(current);
        next.delete(critical);
        return next;
      });
    }
  }

  function badge(fieldKey: string) {
    const extracted = extractedMap.get(fieldKey);
    if (!extracted) return null;
    if (extracted.status === "PRESENT") {
      return (
        <span className="badge info" style={{ marginLeft: 8 }}>
          Extracted p.{extracted.page ?? "?"} ·{" "}
          {extracted.confidence === null
            ? "confidence n/a"
            : `${Math.round(extracted.confidence * 100)}%`}
        </span>
      );
    }
    return (
      <span className="badge warn" style={{ marginLeft: 8 }}>
        {extracted.status.toLowerCase()}
      </span>
    );
  }

  function valueForKey(key: string): string {
    if (key.startsWith("compensationComponents.")) {
      const [, componentKey, property] = key.split(".");
      const component = form.components.find((item) => item.key === componentKey);
      if (!component) return "—";
      return property === "cpfWageClass" ? component.cpfWageClass : component.guarantee;
    }
    switch (key) {
      case "documentKind":
        return form.kind;
      case "employeeResidency":
        return form.residency;
      case "prStatusEffectiveDate":
        return form.prDate || "—";
      case "cpfContributionArrangement":
        return form.arrangement;
      case "dateOfBirth":
        return form.dob || "—";
      case "compensationPeriod":
        return form.period || "—";
      case "basicMonthlySalary":
        return form.salary ? `S$${form.salary}` : "—";
      case "employer.legalName":
        return form.employer || "—";
      case "employeeName":
        return form.employee || "—";
      case "jobTitle":
        return form.title || "—";
      case "duties":
        return form.duties ? `${form.duties.split("\n").filter(Boolean).length} duty item(s)` : "—";
      case "employmentActRoleClassification":
        return form.role;
      case "startDate":
        return form.startDate || "—";
      case "employmentDuration":
        return form.duration === "PERMANENT" ? "Permanent" : `Fixed term to ${form.endDate || "—"}`;
      case "employmentDuration.endDate":
        return form.endDate || "—";
      case "compensationComponents":
        return `${form.components.length} component(s)`;
      case "workingHoursPerDay":
        return form.hours || "Not stated";
      case "workingDaysPerWeek":
        return form.days || "Not stated";
      default:
        return "—";
    }
  }

  function labelForKey(key: string): string {
    const labels: Record<string, string> = {
      documentKind: "Document type",
      employeeResidency: "Residency",
      prStatusEffectiveDate: "PR start date",
      cpfContributionArrangement: "CPF arrangement",
      dateOfBirth: "Date of birth",
      compensationPeriod: "Compensation period",
      basicMonthlySalary: "Basic monthly salary",
      "employer.legalName": "Employer legal name",
      employeeName: "Employee name",
      jobTitle: "Job title",
      duties: "Duties",
      employmentActRoleClassification: "Employment Act role",
      startDate: "Start date",
      employmentDuration: "Employment duration",
      "employmentDuration.endDate": "Fixed-term end date",
      compensationComponents: "Compensation component list",
      workingHoursPerDay: "Working hours per day",
      workingDaysPerWeek: "Working days per week"
    };
    if (key.startsWith("compensationComponents.")) {
      const [, componentKey, property] = key.split(".");
      const component = form.components.find((item) => item.key === componentKey);
      return `${component?.label ?? "Component"} · ${property === "cpfWageClass" ? "CPF class" : "guarantee"}`;
    }
    return labels[key] ?? key;
  }

  const optionalAbsent = new Set(["workingHoursPerDay", "workingDaysPerWeek"]);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setFieldErrors([]);
        try {
          const facts = buildFacts(form);
          const missing = criticalKeys.filter((key) => !confirmed.has(key) && !absent.has(key));
          if (missing.length > 0) {
            throw new Error(
              `Confirm every critical field. Still unconfirmed: ${missing.map(labelForKey).join(", ")}`
            );
          }
          await apiFetch(`/api/documents/${props.documentId}/confirm`, {
            method: "POST",
            json: {
              facts,
              extractionRevisionId: props.extractionRevisionId,
              confirmedFields: [...confirmed],
              absentFields: [...absent]
            }
          });
          router.push(`/documents/${props.documentId}/occupation`);
          router.refresh();
        } catch (caught) {
          const possible = caught as {
            message?: string;
            fieldErrors?: Array<{ field: string; message: string }>;
          };
          setError(possible.message ?? "Could not confirm the facts.");
          if (possible.fieldErrors) setFieldErrors(possible.fieldErrors);
        } finally {
          setBusy(false);
        }
      }}
    >
      <section className="report-section">
        <h2 style={{ fontSize: 22 }}>Document and parties</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="kind">Document type {badge("documentKind")}</label>
            <select
              id="kind"
              value={form.kind}
              onChange={(event) =>
                update("kind", event.target.value as FormState["kind"], "documentKind")
              }
            >
              <option value="OFFER">Offer letter</option>
              <option value="CONTRACT">Employment contract</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="period">
              Compensation period (YYYY-MM) {badge("compensationPeriod")}
            </label>
            <input
              id="period"
              placeholder="2026-11"
              value={form.period}
              onChange={(event) => update("period", event.target.value, "compensationPeriod")}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="employer">Employer legal name {badge("employer.legalName")}</label>
            <input
              id="employer"
              value={form.employer}
              onChange={(event) => update("employer", event.target.value, "employer.legalName")}
            />
          </div>
          <div className="field">
            <label htmlFor="employee">Employee name {badge("employeeName")}</label>
            <input
              id="employee"
              value={form.employee}
              onChange={(event) => update("employee", event.target.value, "employeeName")}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="title">Job title {badge("jobTitle")}</label>
            <input
              id="title"
              value={form.title}
              onChange={(event) => update("title", event.target.value, "jobTitle")}
            />
          </div>
          <div className="field">
            <label htmlFor="industry">Industry (optional)</label>
            <input
              id="industry"
              value={form.industry}
              onChange={(event) => update("industry", event.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="duties">Duties (one per line) {badge("duties")}</label>
          <textarea
            id="duties"
            value={form.duties}
            onChange={(event) => update("duties", event.target.value, "duties")}
          />
        </div>
      </section>

      <section className="report-section">
        <h2 style={{ fontSize: 22 }}>Residency, age, and CPF</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="residency">Residency {badge("employeeResidency")}</label>
            <select
              id="residency"
              value={form.residency}
              onChange={(event) =>
                update(
                  "residency",
                  event.target.value as FormState["residency"],
                  "employeeResidency"
                )
              }
            >
              <option value="CITIZEN">Singapore Citizen</option>
              <option value="PR">Singapore PR</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dob">Date of birth {badge("dateOfBirth")}</label>
            <input
              id="dob"
              type="date"
              value={form.dob}
              onChange={(event) => update("dob", event.target.value, "dateOfBirth")}
            />
          </div>
        </div>
        {form.residency === "PR" ? (
          <div className="field-row">
            <div className="field">
              <label htmlFor="prDate">PR start date {badge("prStatusEffectiveDate")}</label>
              <input
                id="prDate"
                type="date"
                value={form.prDate}
                onChange={(event) => update("prDate", event.target.value, "prStatusEffectiveDate")}
              />
            </div>
            <div className="field">
              <label htmlFor="arrangement">
                CPF contribution arrangement {badge("cpfContributionArrangement")}
              </label>
              <select
                id="arrangement"
                value={form.arrangement}
                onChange={(event) =>
                  update(
                    "arrangement",
                    event.target.value as FormState["arrangement"],
                    "cpfContributionArrangement"
                  )
                }
              >
                <option value="FULL_STANDARD">Full standard rates</option>
                <option value="FULL_EMPLOYER_FULL_EMPLOYEE">
                  Full employer and employee rates
                </option>
                <option value="GRADUATED_STANDARD">Graduated rates</option>
                <option value="FULL_EMPLOYER_GRADUATED_EMPLOYEE">
                  Full employer, graduated employee
                </option>
                <option value="UNKNOWN">I’m not sure</option>
              </select>
              {form.arrangement.includes("GRADUATED") || form.arrangement === "UNKNOWN" ? (
                <div className="banner warn">
                  Graduated first/second-year PR rates need official Table 2/3 fixtures not approved
                  in this release. CPF will be unavailable; other sections still run.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="arrangement">CPF contribution arrangement</label>
            <select
              id="arrangement"
              value={form.arrangement}
              onChange={(event) =>
                update(
                  "arrangement",
                  event.target.value as FormState["arrangement"],
                  "cpfContributionArrangement"
                )
              }
            >
              <option value="FULL_STANDARD">Full standard rates</option>
              <option value="UNKNOWN">I’m not sure</option>
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="role">
            Employment Act role classification {badge("employmentActRoleClassification")}
          </label>
          <select
            id="role"
            value={form.role}
            onChange={(event) =>
              update(
                "role",
                event.target.value as FormState["role"],
                "employmentActRoleClassification"
              )
            }
          >
            <option value="WORKMAN">Workman (mainly manual labour)</option>
            <option value="NON_WORKMAN">Non-workman</option>
            <option value="MANAGER_EXECUTIVE">Manager / executive</option>
            <option value="UNKNOWN">I’m not sure</option>
          </select>
          <p className="hint">
            A job title alone never decides this. “Not sure” yields an indeterminate result, not a
            guess.
          </p>
        </div>
      </section>

      <section className="report-section">
        <h2 style={{ fontSize: 22 }}>Pay and start date</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="salary">Basic monthly salary (S$) {badge("basicMonthlySalary")}</label>
            <input
              id="salary"
              inputMode="decimal"
              value={form.salary}
              onChange={(event) => update("salary", event.target.value, "basicMonthlySalary")}
            />
          </div>
          <div className="field">
            <label htmlFor="startDate">Start date {badge("startDate")}</label>
            <input
              id="startDate"
              type="date"
              value={form.startDate}
              onChange={(event) => update("startDate", event.target.value, "startDate")}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="duration">Duration {badge("employmentDuration")}</label>
            <select
              id="duration"
              value={form.duration}
              onChange={(event) =>
                update(
                  "duration",
                  event.target.value as FormState["duration"],
                  "employmentDuration"
                )
              }
            >
              <option value="PERMANENT">Permanent</option>
              <option value="FIXED_TERM">Fixed term</option>
            </select>
          </div>
          {form.duration === "FIXED_TERM" ? (
            <div className="field">
              <label htmlFor="endDate">End date {badge("employmentDuration")}</label>
              <input
                id="endDate"
                type="date"
                value={form.endDate}
                onChange={(event) =>
                  update("endDate", event.target.value, "employmentDuration.endDate")
                }
              />
            </div>
          ) : null}
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="hours">Working hours per day {badge("workingHoursPerDay")}</label>
            <input
              id="hours"
              placeholder="8"
              value={form.hours}
              onChange={(event) => update("hours", event.target.value, "workingHoursPerDay")}
            />
          </div>
          <div className="field">
            <label htmlFor="days">Working days per week {badge("workingDaysPerWeek")}</label>
            <input
              id="days"
              placeholder="5"
              value={form.days}
              onChange={(event) => update("days", event.target.value, "workingDaysPerWeek")}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="salaryPeriod">Salary period</label>
            <input
              id="salaryPeriod"
              placeholder="Monthly"
              value={form.salaryPeriod}
              onChange={(event) => update("salaryPeriod", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="restDay">Rest day</label>
            <input
              id="restDay"
              placeholder="Saturday"
              value={form.restDay}
              onChange={(event) => update("restDay", event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="report-section">
        <div className="section-head">
          <h2 style={{ fontSize: 22, margin: 0 }}>Compensation components</h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setForm((current) => ({
                ...current,
                components: [
                  ...current.components,
                  {
                    key: `c${current.components.length + 1}_${slug("component")}`,
                    label: "",
                    amount: "",
                    cadence: "MONTHLY",
                    guarantee: "GUARANTEED",
                    direction: "EARNING",
                    cpfWageClass: "ORDINARY_WAGE"
                  }
                ]
              }))
            }
          >
            Add component
          </button>
        </div>
        <p className="small muted">
          Basic salary is entered separately. Add fixed allowances, AWS, bonuses, and deductions
          here. Anything not guaranteed is excluded from guaranteed totals. “Needs review” blocks
          CPF.
        </p>
        {form.components.length === 0 ? (
          <p className="small muted">No additional components.</p>
        ) : null}
        {form.components.map((component, index) => (
          <div key={component.key} className="card" style={{ marginBottom: 12, padding: 16 }}>
            <div className="field-row">
              <div className="field">
                <label>Label</label>
                <input
                  value={component.label}
                  onChange={(event) => {
                    const next = [...form.components];
                    const label = event.target.value;
                    const oldKey = component.key;
                    const newKey = `${oldKey.split("_")[0]}_${slug(label)}`;
                    next[index] = { ...component, label, key: newKey };
                    for (const property of ["cpfWageClass", "guarantee"] as const) {
                      setConfirmed((current) => {
                        const set = new Set(current);
                        set.delete(`compensationComponents.${oldKey}.${property}`);
                        return set;
                      });
                    }
                    setForm((current) => ({ ...current, components: next }));
                  }}
                />
              </div>
              <div className="field">
                <label>Amount (S$)</label>
                <input
                  inputMode="decimal"
                  value={component.amount}
                  onChange={(event) => {
                    const next = [...form.components];
                    next[index] = { ...component, amount: event.target.value };
                    setForm((current) => ({ ...current, components: next }));
                  }}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Cadence</label>
                <select
                  value={component.cadence}
                  onChange={(event) => {
                    const next = [...form.components];
                    next[index] = {
                      ...component,
                      cadence: event.target.value as ComponentForm["cadence"]
                    };
                    setForm((current) => ({ ...current, components: next }));
                  }}
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="ANNUAL">Annual</option>
                  <option value="ONE_OFF">One-off</option>
                  <option value="FORMULA">Formula</option>
                </select>
              </div>
              <div className="field">
                <label>Direction</label>
                <select
                  value={component.direction}
                  onChange={(event) => {
                    const next = [...form.components];
                    next[index] = {
                      ...component,
                      direction: event.target.value as ComponentForm["direction"]
                    };
                    setForm((current) => ({ ...current, components: next }));
                  }}
                >
                  <option value="EARNING">Earning</option>
                  <option value="DEDUCTION">Deduction</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Guarantee</label>
                <select
                  value={component.guarantee}
                  onChange={(event) => {
                    const next = [...form.components];
                    next[index] = {
                      ...component,
                      guarantee: event.target.value as ComponentForm["guarantee"]
                    };
                    setForm((current) => ({ ...current, components: next }));
                    setConfirmed((current) => {
                      const set = new Set(current);
                      set.delete(`compensationComponents.${component.key}.guarantee`);
                      return set;
                    });
                  }}
                >
                  <option value="GUARANTEED">Guaranteed</option>
                  <option value="DISCRETIONARY">Discretionary</option>
                  <option value="INDETERMINATE">Not clear / indeterminate</option>
                </select>
              </div>
              <div className="field">
                <label>CPF wage class</label>
                <select
                  value={component.cpfWageClass}
                  onChange={(event) => {
                    const next = [...form.components];
                    next[index] = {
                      ...component,
                      cpfWageClass: event.target.value as ComponentForm["cpfWageClass"]
                    };
                    setForm((current) => ({ ...current, components: next }));
                    setConfirmed((current) => {
                      const set = new Set(current);
                      set.delete(`compensationComponents.${component.key}.cpfWageClass`);
                      return set;
                    });
                  }}
                >
                  <option value="ORDINARY_WAGE">Ordinary wage</option>
                  <option value="ADDITIONAL_WAGE">Additional wage</option>
                  <option value="EXCLUDED">Excluded (e.g. reimbursement)</option>
                  <option value="NEEDS_REVIEW">Needs review</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  components: current.components.filter((_, i) => i !== index)
                }))
              }
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className="report-section">
        <h2 style={{ fontSize: 22 }}>Other terms</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="leaveAnnual">Annual leave</label>
            <input
              id="leaveAnnual"
              value={form.leaveAnnual}
              onChange={(event) => update("leaveAnnual", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="leaveSick">Outpatient sick leave</label>
            <input
              id="leaveSick"
              value={form.leaveSick}
              onChange={(event) => update("leaveSick", event.target.value)}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="leaveHosp">Hospitalisation leave</label>
            <input
              id="leaveHosp"
              value={form.leaveHosp}
              onChange={(event) => update("leaveHosp", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="medical">Medical benefits</label>
            <input
              id="medical"
              value={form.medical}
              onChange={(event) => update("medical", event.target.value)}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="probation">Probation</label>
            <input
              id="probation"
              value={form.probation}
              onChange={(event) => update("probation", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="notice">Notice period</label>
            <input
              id="notice"
              value={form.notice}
              onChange={(event) => update("notice", event.target.value)}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="otRate">Overtime rate</label>
            <input
              id="otRate"
              placeholder="1.5x"
              value={form.otRate}
              onChange={(event) => update("otRate", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="otPeriod">Overtime payment period</label>
            <input
              id="otPeriod"
              value={form.otPeriod}
              onChange={(event) => update("otPeriod", event.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="place">Place of work (optional)</label>
          <input
            id="place"
            value={form.place}
            onChange={(event) => update("place", event.target.value)}
          />
        </div>
      </section>

      <section className="report-section" aria-labelledby="confirm-heading">
        <h2 id="confirm-heading" style={{ fontSize: 22 }}>
          Explicit confirmation
        </h2>
        <p className="small muted">
          Controls start unchecked. The server recomputes every value hash and rejects stale or
          missing confirmations.
        </p>
        {criticalKeys.map((key) => (
          <div className="item-row" key={key}>
            <div>
              <strong className="small">{labelForKey(key)}</strong>
              <div className="small muted">{valueForKey(key)}</div>
            </div>
            <div className="stack" style={{ minWidth: 190 }}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmed.has(key)}
                  onChange={(event) => {
                    setConfirmed((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(key);
                      else next.delete(key);
                      return next;
                    });
                    if (event.target.checked) {
                      setAbsent((current) => {
                        const next = new Set(current);
                        next.delete(key);
                        return next;
                      });
                    }
                  }}
                />
                I confirm this
              </label>
              {optionalAbsent.has(key) ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={absent.has(key)}
                    onChange={(event) => {
                      setAbsent((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(key);
                        else next.delete(key);
                        return next;
                      });
                      if (event.target.checked) {
                        setConfirmed((current) => {
                          const next = new Set(current);
                          next.delete(key);
                          return next;
                        });
                      }
                    }}
                  />
                  Not stated / confirm absent
                </label>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      {error ? (
        <div className="banner bad" role="alert">
          {error}
          {fieldErrors.length > 0 ? (
            <ul>
              {fieldErrors.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>
                  {issue.field}: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Confirming…" : "Confirm facts and continue"}
        </button>
      </div>
    </form>
  );
}
