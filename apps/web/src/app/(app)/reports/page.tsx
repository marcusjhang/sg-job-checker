import Link from "next/link";
import { getDb, tenantDb } from "@job-checker/db";
import { requirePageActor } from "@/lib/auth";
import type { ReportRenderModel } from "@job-checker/contracts";

export default async function ReportsPage() {
  const actor = await requirePageActor("/reports");
  const reports = await tenantDb(getDb(), actor.userId).reports().execute();

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="section-head">
        <div>
          <p className="eyebrow">History</p>
          <h1 style={{ fontSize: 38, marginBottom: 4 }}>Your reports</h1>
        </div>
        <Link className="btn btn-primary" href="/new">
          New check
        </Link>
      </div>
      <p className="small muted">
        Phase 1A retains reports for 30 days after the latest generation. Each correction creates a
        new version; old versions stay readable until deletion.
      </p>
      {reports.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h3>No reports yet</h3>
          <p className="small muted">
            Start with an offer or contract. You will confirm every critical fact first.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 18 }}>
          {reports.map((report) => {
            const model = report.rendered_json as ReportRenderModel;
            return (
              <div className="card" key={report.id}>
                <div className="section-head">
                  <div>
                    <h3 style={{ marginBottom: 4 }}>
                      <Link href={`/reports/${report.id}`}>
                        {model.factsSummary.jobTitle} · {model.factsSummary.employer}
                      </Link>
                    </h3>
                    <p className="small muted">
                      Report v{report.version} · generated{" "}
                      {new Date(report.created_at).toLocaleString("en-SG")} ·{" "}
                      {report.partial_coverage ? "partial coverage" : "complete coverage"}
                    </p>
                  </div>
                  <span className={`badge ${report.status === "SUPERSEDED" ? "warn" : ""}`}>
                    {report.status.toLowerCase()}
                  </span>
                </div>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <Link className="btn btn-secondary" href={`/reports/${report.id}`}>
                    Open report
                  </Link>
                  <Link
                    className="btn btn-secondary"
                    href={`/documents/${report.document_id}/review`}
                  >
                    Correct facts
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
