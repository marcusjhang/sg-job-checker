import { getDb } from "@job-checker/db";
import { queueMetrics } from "@job-checker/db";
import { requireStaffPage } from "@/lib/auth";
import { RetryJobButton } from "@/components/retry-job";

export default async function OperationsPage() {
  await requireStaffPage();
  const metrics = await queueMetrics(getDb());
  const failed = await getDb()
    .selectFrom("jobs")
    .select([
      "id",
      "kind",
      "state",
      "attempt_count",
      "max_attempts",
      "last_error_code",
      "completed_at"
    ])
    .where("state", "in", ["FAILED", "RETRY"])
    .orderBy("completed_at", "desc")
    .limit(50)
    .execute();

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <p className="eyebrow">Staff</p>
      <h1 style={{ fontSize: 38 }}>Operations</h1>
      <p className="lede">
        Least-privilege view: identifiers are shortened, and no document text, salary, names, or
        prompt payloads are shown. Repairs are targeted and audited.
      </p>
      <div className="grid three" style={{ marginBottom: 24 }}>
        {Object.entries(metrics).map(([state, count]) => (
          <div className="card" key={state}>
            <p className="small muted">{state}</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{count}</p>
          </div>
        ))}
      </div>
      <h2 style={{ fontSize: 24 }}>Failed or retrying jobs</h2>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Job</th>
            <th scope="col">Kind</th>
            <th scope="col">Attempts</th>
            <th scope="col">Error</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {failed.length === 0 ? (
            <tr>
              <td colSpan={5} className="small muted">
                No failed or retrying jobs.
              </td>
            </tr>
          ) : null}
          {failed.map((job) => (
            <tr key={job.id}>
              <td className="mono">{job.id.slice(0, 8)}</td>
              <td>{job.kind}</td>
              <td>
                {job.attempt_count}/{job.max_attempts}
              </td>
              <td className="mono">{job.last_error_code ?? "—"}</td>
              <td>{job.state === "FAILED" ? <RetryJobButton jobId={job.id} /> : "waiting"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
