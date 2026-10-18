import Link from "next/link";
import type { ReportRenderModel } from "@job-checker/contracts";

type EvidenceView = {
  key: string;
  category: string;
  steps: unknown;
  applicability: unknown;
  warnings: unknown;
  effectiveDate: string;
  ruleVersionId: string | null;
};

function categoryBadge(category: string): { label: string; className: string } {
  switch (category) {
    case "CONFIRMED_FACT":
      return { label: "Confirmed fact", className: "" };
    case "USER_ENTRY":
      return { label: "User entry", className: "neutral" };
    case "COMPENSATION":
      return { label: "Calculation", className: "info" };
    case "CPF":
      return { label: "CPF rule", className: "info" };
    case "BENCHMARK":
      return { label: "Benchmark context", className: "warn" };
    case "EMPLOYMENT_ACT":
      return { label: "Employment Act context", className: "info" };
    case "KET":
      return { label: "KET check", className: "neutral" };
    case "INTERPRETATION":
      return { label: "Interpretation", className: "neutral" };
    default:
      return { label: category.toLowerCase(), className: "neutral" };
  }
}

export function ReportView({
  model,
  evidence,
  publicView = false
}: {
  model: ReportRenderModel;
  evidence: EvidenceView[];
  publicView?: boolean;
}) {
  const evidenceByKey = new Map(evidence.map((item) => [item.key, item]));
  return (
    <article aria-labelledby="report-title">
      <header>
        <p className="eyebrow">
          {model.documentKind === "OFFER" ? "Offer" : "Contract"} report · version{" "}
          {model.reportVersion}
        </p>
        <h1 id="report-title" style={{ fontSize: 40 }}>
          {model.factsSummary.jobTitle}
        </h1>
        <p className="lede">
          {model.factsSummary.employer} · starts {model.factsSummary.startDate} · basic{" "}
          {`S$${(model.factsSummary.basicMonthlySalary.cents / 100).toFixed(2)}`}
        </p>
        <div className="btn-row no-print">
          <span className={`badge ${model.partialCoverage ? "warn" : ""}`}>
            {model.partialCoverage ? "Partial coverage" : "Complete coverage"}
          </span>
          <span className="badge neutral">
            Generated {new Date(model.generatedAt).toLocaleString("en-SG")}
          </span>
          <span className="badge neutral">Report {model.reportId.slice(0, 8)}</span>
        </div>
      </header>

      {model.partialCoverage ? (
        <div className="banner warn" role="status">
          Some sections are unavailable or indeterminate. Unaffected sections are still shown;
          unavailable evidence never becomes a guess.
        </div>
      ) : null}
      {model.staleDependencies.length > 0 ? (
        <div className="banner bad" role="status">
          A dependency changed after this report was generated: {model.staleDependencies.join(", ")}
          . Regenerate to use the current approved versions.
        </div>
      ) : null}

      {model.disclaimers.map((disclaimer, index) => (
        <p className="small muted" key={`disclaimer-${index}`}>
          {disclaimer}
        </p>
      ))}

      {model.sections.map((section) => {
        const relatedEvidence = section.values
          .map((value) => (value.evidenceKey ? evidenceByKey.get(value.evidenceKey) : null))
          .filter((item): item is EvidenceView => Boolean(item));
        return (
          <section
            className="report-section"
            key={section.key}
            aria-labelledby={`section-${section.key}`}
          >
            <div className="section-head">
              <h2 id={`section-${section.key}`} style={{ fontSize: 24, margin: 0 }}>
                {section.title}
              </h2>
            </div>
            <p className="small muted">{section.summary}</p>
            {section.values.map((value, index) => {
              const badge = categoryBadge(value.category);
              return (
                <div className="value-row" key={`${value.label}-${index}`}>
                  <div>
                    <div className="value-label">{value.label}</div>
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                    {value.formula ? <div className="value-note">{value.formula}</div> : null}
                    {value.warning ? <div className="value-note">{value.warning}</div> : null}
                  </div>
                  <div className="value-number">{value.value}</div>
                </div>
              );
            })}
            {section.items?.map((item) => (
              <div className="item-row" key={item.key}>
                <div>
                  <strong className="small">{item.label}</strong>
                  <div className="small muted">{item.detail}</div>
                  {item.action ? <div className="small">Next: {item.action}</div> : null}
                </div>
                <span
                  className={`badge ${
                    item.status === "PRESENT"
                      ? ""
                      : item.status === "MISSING"
                        ? "warn"
                        : item.status === "NOT_APPLICABLE"
                          ? "neutral"
                          : "warn"
                  }`}
                >
                  {item.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </div>
            ))}
            {section.warnings.map((warning, index) => (
              <div className="banner warn small" key={`${section.key}-warning-${index}`}>
                {warning}
              </div>
            ))}
            {relatedEvidence.length > 0 ? (
              <details className="small" style={{ marginTop: 12 }}>
                <summary>Calculation steps and applicability</summary>
                {relatedEvidence.map((item, index) => (
                  <div key={`${item.key}-${index}`} style={{ marginTop: 8 }}>
                    <strong className="mono">{item.key}</strong>
                    <span className="badge neutral" style={{ marginLeft: 8 }}>
                      {String((item.applicability as { status?: string })?.status ?? "UNKNOWN")}
                    </span>
                    <span className="badge neutral" style={{ marginLeft: 6 }}>
                      effective {item.effectiveDate}
                    </span>
                    <ol className="steps">
                      {(
                        item.steps as Array<{ label: string; expression?: string; result: string }>
                      ).map((step, index) => (
                        <li key={index}>
                          {step.label}
                          {step.expression ? (
                            <span className="mono"> — {step.expression}</span>
                          ) : null}{" "}
                          → <strong>{step.result}</strong>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </details>
            ) : null}
          </section>
        );
      })}

      <section className="report-section" aria-labelledby="questions-heading">
        <h2 id="questions-heading" style={{ fontSize: 24 }}>
          Questions for HR
        </h2>
        {model.questions.length === 0 ? (
          <p className="small muted">No clarifications were generated from the confirmed facts.</p>
        ) : (
          <ol className="steps" style={{ fontSize: 14 }}>
            {model.questions.map((question) => (
              <li key={question.id} style={{ marginBottom: 10 }}>
                <strong>{question.text}</strong>
                <div className="small muted">{question.reason}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="report-section" aria-labelledby="sources-heading">
        <h2 id="sources-heading" style={{ fontSize: 24 }}>
          Sources and versions
        </h2>
        {model.sources.length === 0 ? (
          <p className="small muted">No external sources were pinned for this report.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Effective</th>
                <th scope="col">Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {model.sources.map((source, index) => (
                <tr key={`${source.url}-${source.effectiveDate}-${index}`}>
                  <td>
                    <a href={source.url} rel="noreferrer noopener" target="_blank">
                      {source.label}
                    </a>
                    {source.ruleVersion ? (
                      <div className="small muted">{source.ruleVersion}</div>
                    ) : null}
                    {source.limitations ? (
                      <div className="small muted">{source.limitations}</div>
                    ) : null}
                  </td>
                  <td>{source.effectiveDate}</td>
                  <td className="mono">{source.snapshotChecksum.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {!publicView ? (
        <p className="small muted no-print">
          <Link href="/reports">All reports</Link>
        </p>
      ) : (
        <p className="small muted">Shared view only. The owner can revoke this link at any time.</p>
      )}
    </article>
  );
}
