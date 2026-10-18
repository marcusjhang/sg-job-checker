"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

type Candidate = {
  code: string;
  title: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  matchedSignals: string[];
};

type SnapshotInfo = {
  datasetKey: string;
  version: string;
  effectiveDate: string;
  wageBasis: string;
  limitations: string;
  demo: boolean;
};

export function OccupationSelector(props: {
  documentId: string;
  confirmedRevisionId: string;
  reportPeriod: string;
  initialMatchId: string | null;
  initialCandidates: Candidate[];
  initialSelectedCode: string | null;
  snapshot: SnapshotInfo | null;
}) {
  const router = useRouter();
  const [matchId, setMatchId] = useState(props.initialMatchId);
  const [candidates, setCandidates] = useState<Candidate[]>(props.initialCandidates);
  const [selectedCode, setSelectedCode] = useState<string | null>(props.initialSelectedCode);
  const [snapshot, setSnapshot] = useState<SnapshotInfo | null>(props.snapshot);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function findMatches() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{
        matchId: string | null;
        candidates: Candidate[];
        snapshot: SnapshotInfo | null;
      }>(`/api/documents/${props.documentId}/matches`, { method: "POST", json: {} });
      setMatchId(result.matchId);
      setCandidates(result.candidates);
      setSnapshot(result.snapshot);
      setSelectedCode(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not find matches");
    } finally {
      setBusy(false);
    }
  }

  async function choose(code: string | null) {
    if (!matchId) return;
    setError(null);
    try {
      await apiFetch(`/api/documents/${props.documentId}/matches`, {
        method: "PUT",
        json: { matchId, selectedCode: code }
      });
      setSelectedCode(code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the selection");
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ reportId: string }>(
        `/api/documents/${props.documentId}/reports`,
        {
          method: "POST",
          json: {
            operationKey: crypto.randomUUID(),
            confirmedRevisionId: props.confirmedRevisionId,
            requestedPeriod: props.reportPeriod
          }
        }
      );
      router.push(`/reports/${result.reportId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate the report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {snapshot ? (
        <div className={`banner ${snapshot.demo ? "warn" : "info"}`}>
          <strong>
            {snapshot.datasetKey} {snapshot.version}
          </strong>{" "}
          · effective {snapshot.effectiveDate} · {snapshot.wageBasis}. {snapshot.limitations}
        </div>
      ) : null}

      <div className="card">
        <div className="section-head">
          <h3 style={{ margin: 0 }}>Candidate occupations</h3>
          <button className="btn btn-secondary" type="button" onClick={findMatches} disabled={busy}>
            {candidates.length > 0 ? "Refresh matches" : "Find matches"}
          </button>
        </div>
        {candidates.length === 0 ? (
          <p className="small muted">
            No candidates yet. Find matches from the confirmed title, duties, seniority, and
            industry.
          </p>
        ) : (
          <div className="stack">
            {candidates.map((candidate) => (
              <label
                className="card"
                key={candidate.code}
                style={{ padding: 14, display: "block" }}
              >
                <span className="check" style={{ fontWeight: 650 }}>
                  <input
                    type="radio"
                    name="occupation"
                    checked={selectedCode === candidate.code}
                    onChange={() => choose(candidate.code)}
                  />
                  {candidate.title}
                  <span
                    className={`badge ${candidate.confidence === "HIGH" ? "" : candidate.confidence === "MEDIUM" ? "info" : "warn"}`}
                  >
                    {candidate.confidence}
                  </span>
                </span>
                <span className="small muted" style={{ display: "block", marginLeft: 28 }}>
                  Matched signals: {candidate.matchedSignals.join(", ") || "title/duty overlap"}
                </span>
              </label>
            ))}
            <label className="check">
              <input
                type="radio"
                name="occupation"
                checked={selectedCode === null && matchId !== null}
                onChange={() => choose(null)}
              />
              None of these fits — continue without a benchmark
            </label>
          </div>
        )}
      </div>

      {error ? (
        <div className="banner bad" role="alert">
          {error}
        </div>
      ) : null}

      <div className="btn-row">
        <button
          className="btn btn-primary"
          type="button"
          onClick={generate}
          disabled={busy || !matchId}
        >
          {busy ? "Generating…" : "Generate report"}
        </button>
        <a className="btn btn-secondary" href={`/documents/${props.documentId}/review`}>
          Back to facts
        </a>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        Generation is one transaction and pins the confirmed revision, rules, sources, and
        benchmark. A repeated operation key with the same inputs returns the same report.
      </p>
    </div>
  );
}
