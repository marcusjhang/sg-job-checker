import { notFound } from "next/navigation";
import { getDb, tenantDb } from "@job-checker/db";
import { requirePageActor } from "@/lib/auth";
import { ConfirmedEmploymentFactsV1Schema } from "@job-checker/contracts";
import { OccupationSelector } from "@/components/occupation-selector";

export default async function OccupationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const tenant = tenantDb(getDb(), actor.userId);
  try {
    await tenant.document(id);
  } catch {
    notFound();
  }
  const confirmed = await tenant.latestConfirmedRevision(id);
  if (!confirmed) notFound();
  const facts = ConfirmedEmploymentFactsV1Schema.parse(confirmed.facts);
  const match = await getDb()
    .selectFrom("occupation_matches")
    .selectAll()
    .where("user_id", "=", actor.userId)
    .where("confirmed_revision_id", "=", confirmed.id)
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
  const snapshot = await getDb()
    .selectFrom("benchmark_snapshots")
    .selectAll()
    .where("review_state", "in", ["APPROVED", "DEMO"])
    .orderBy("effective_date", "desc")
    .limit(1)
    .executeTakeFirst();

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <p className="eyebrow">Step 3 · Wage context</p>
      <h1 style={{ fontSize: 38 }}>Choose the occupation</h1>
      <p className="lede">
        The benchmark is context, not a verdict. Match the duties, not just the title, and confirm
        the candidate yourself. “None fits” is a valid answer and does not block the rest of the
        report.
      </p>
      <div className="card" style={{ marginBottom: 18 }}>
        <p className="small muted">Confirmed role</p>
        <h3 style={{ marginBottom: 4 }}>{facts.jobTitle}</h3>
        <p className="small muted">
          {facts.employer.legalName} · {facts.startDate} · basic S$
          {(facts.basicMonthlySalary.cents / 100).toFixed(2)}
        </p>
      </div>
      <OccupationSelector
        documentId={id}
        confirmedRevisionId={confirmed.id}
        reportPeriod={facts.compensationPeriod}
        initialMatchId={match?.id ?? null}
        initialCandidates={
          (match?.candidates as Array<{
            code: string;
            title: string;
            confidence: "HIGH" | "MEDIUM" | "LOW";
            score: number;
            matchedSignals: string[];
          }>) ?? []
        }
        initialSelectedCode={match?.selected_code ?? null}
        snapshot={
          snapshot
            ? {
                datasetKey: snapshot.dataset_key,
                version: snapshot.version,
                effectiveDate: snapshot.effective_date,
                wageBasis: snapshot.wage_basis,
                limitations: snapshot.limitations,
                demo: snapshot.review_state === "DEMO" || snapshot.dataset_key === "DEMO_FIXTURE"
              }
            : null
        }
      />
    </div>
  );
}
