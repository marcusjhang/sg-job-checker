import { getDb } from "@job-checker/db";
import { requireStaffPage } from "@/lib/auth";

export default async function SourcesPage() {
  await requireStaffPage();
  const rows = await getDb()
    .selectFrom("sources")
    .leftJoin("source_versions", "source_versions.source_id", "sources.id")
    .select([
      "sources.owner",
      "sources.canonical_url",
      "sources.purpose",
      "sources.refresh_policy",
      "sources.max_stale_days",
      "source_versions.review_state",
      "source_versions.checked_at",
      "source_versions.content_sha256"
    ])
    .orderBy("sources.owner")
    .execute();

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <p className="eyebrow">Staff</p>
      <h1 style={{ fontSize: 38 }}>Source health</h1>
      <p className="lede">
        Runtime authority is the registry. Numeric values are not copied from planning documents; a
        production deployment must replace seed snapshots with captured official artefacts and
        second-person approval.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Refresh</th>
            <th scope="col">Checked</th>
            <th scope="col">State</th>
            <th scope="col">Snapshot</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const stale = row.checked_at
              ? Date.now() - row.checked_at.valueOf() > row.max_stale_days * 86_400_000
              : true;
            return (
              <tr key={`${row.canonical_url}-${index}`}>
                <td>
                  <strong>{row.owner}</strong>
                  <div className="small muted">{row.purpose}</div>
                  <a
                    className="small"
                    href={row.canonical_url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {row.canonical_url}
                  </a>
                </td>
                <td>{row.refresh_policy}</td>
                <td>
                  {row.checked_at ? new Date(row.checked_at).toLocaleDateString("en-SG") : "never"}
                </td>
                <td>
                  <span className={`badge ${stale ? "warn" : ""}`}>
                    {stale ? "STALE" : "WITHIN WINDOW"}
                  </span>
                  <div className="small muted">{row.review_state ?? "PENDING"}</div>
                </td>
                <td className="mono">
                  {row.content_sha256 ? `${row.content_sha256.slice(0, 12)}…` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
