import Link from "next/link";
import { currentActor } from "@/lib/auth";

export default async function HomePage() {
  const actor = await currentActor();
  return (
    <div className="wrap">
      <section className="hero">
        <div>
          <p className="eyebrow">Singapore · offers and contracts</p>
          <h1>Know what the offer actually pays.</h1>
          <p className="lede">
            Upload an offer or enter the facts. Confirm every critical field. Get a reproducible
            report covering guaranteed pay, CPF, key employment terms, official wage context, and
            the exact questions to ask HR.
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" href={actor ? "/new" : "/signin?next=%2Fnew"}>
              {actor ? "Start a check" : "Sign in to start"}
            </Link>
            {actor ? (
              <Link className="btn btn-secondary" href="/reports">
                View reports
              </Link>
            ) : (
              <Link className="btn btn-secondary" href="/privacy">
                Read the privacy notice
              </Link>
            )}
          </div>
          <p className="hint" style={{ marginTop: 16 }}>
            Phase 1A: offers and contracts only. No result is generated until every critical field
            is confirmed.
          </p>
        </div>
        <aside className="hero-card">
          <p className="eyebrow">What the report separates</p>
          <div className="stack">
            <div>
              <span className="badge">Confirmed facts</span>
              <p className="small muted" style={{ marginTop: 6 }}>
                You explicitly accept, edit, or confirm-absent each critical field.
              </p>
            </div>
            <div>
              <span className="badge info">Deterministic calculations</span>
              <p className="small muted" style={{ marginTop: 6 }}>
                CPF and pay use versioned rules, integer cents, and named steps.
              </p>
            </div>
            <div>
              <span className="badge warn">Benchmark context</span>
              <p className="small muted" style={{ marginTop: 6 }}>
                Wage percentiles show their date, basis, coverage, and limitations.
              </p>
            </div>
            <div>
              <span className="badge neutral">Questions, not verdicts</span>
              <p className="small muted" style={{ marginTop: 6 }}>
                Missing terms become precise HR questions, never an “illegal” label.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid three" style={{ marginTop: 30 }}>
        <div className="card">
          <h3>Built for confirmation</h3>
          <p className="small muted">
            Extraction is a proposal. A single missing critical confirmation blocks generation. The
            S$8,000 → S$6,000 correction is a first-class path, not an afterthought.
          </p>
        </div>
        <div className="card">
          <h3>Privacy by default</h3>
          <p className="small muted">
            Clean files only, private storage, encrypted text, 24-hour raw retention after report
            generation, 7-day abandoned retention, and immediate deletion.
          </p>
        </div>
        <div className="card">
          <h3>Reproducible</h3>
          <p className="small muted">
            Reports pin the confirmed revision, rule versions, source snapshots, benchmark snapshot,
            evidence, and a manifest. Corrections create new versions.
          </p>
        </div>
      </section>

      <section style={{ marginTop: 42 }}>
        <p className="eyebrow">Coming later</p>
        <h2>Two entry points stay disabled in Phase 1</h2>
        <div className="grid two" style={{ marginTop: 16 }}>
          <div className="card disabled-card">
            <h3>Payslip check</h3>
            <p className="small muted">
              Needs a separate reviewed payslip catalogue, YTD dependencies, and tolerance rules.
            </p>
            <button className="btn btn-secondary" disabled aria-disabled="true">
              Payslip — coming later
            </button>
          </div>
          <div className="card disabled-card">
            <h3>Compare offers</h3>
            <p className="small muted">
              Needs pinned source reports and comparable-basis alignment before it can be honest.
            </p>
            <button className="btn btn-secondary" disabled aria-disabled="true">
              Compare — coming later
            </button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 42 }} className="card card-muted">
        <h2>What this release deliberately does not do</h2>
        <p className="small">
          Foreign-worker levies, work-pass eligibility, shift schedules, equity valuation,
          commission-dominant roles, tax advice, non-compete enforceability, and outcome prediction
          are out of scope. A term is never called “illegal”; the report says clarify or seek advice
          unless a reviewed deterministic rule supports the exact conclusion.
        </p>
      </section>
    </div>
  );
}
