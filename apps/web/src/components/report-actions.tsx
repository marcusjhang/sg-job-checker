"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

type ShareView = { id: string; expiresAt: string; revoked: boolean };

export function ReportActions(props: {
  reportId: string;
  documentId: string;
  questions: Array<{ id: string; text: string }>;
  shares: ShareView[];
  status: string;
  confirmedRevisionId: string;
  reportPeriod: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(props.questions.slice(0, 6).map((q) => q.id));
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shares, setShares] = useState(props.shares);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generateDraft() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ subject: string; body: string }>(
        `/api/reports/${props.reportId}/hr-draft`,
        { method: "POST", json: { selectedQuestionIds: selected } }
      );
      setDraft(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not draft the message");
    } finally {
      setBusy(false);
    }
  }

  async function createShare() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ url: string; shareId: string; expiresAt: string }>(
        `/api/reports/${props.reportId}/shares`,
        { method: "POST", json: {} }
      );
      setShareUrl(`${window.location.origin}${result.url}`);
      setShares((current) => [
        ...current,
        { id: result.shareId, expiresAt: result.expiresAt, revoked: false }
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a share link");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/shares/${shareId}`, { method: "DELETE", json: {} });
      setShares((current) =>
        current.map((share) => (share.id === shareId ? { ...share, revoked: true } : share))
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke the share");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
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
      setError(caught instanceof Error ? caught.message : "Could not regenerate the report");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument() {
    if (
      !window.confirm(
        "Delete this document, its facts, and all reports now? This cannot be undone."
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/documents/${props.documentId}`, {
        method: "DELETE",
        json: { operationKey: crypto.randomUUID() }
      });
      router.push("/reports");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the document");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print">
      <div className="btn-row" style={{ marginBottom: 18 }}>
        <a className="btn btn-primary" href={`/api/reports/${props.reportId}/export`}>
          Download PDF
        </a>
        <a className="btn btn-secondary" href={`/documents/${props.documentId}/review`}>
          Correct facts
        </a>
        <button className="btn btn-secondary" type="button" onClick={regenerate} disabled={busy}>
          Regenerate with current versions
        </button>
        <button className="btn btn-secondary" type="button" onClick={createShare} disabled={busy}>
          Create 7-day share link
        </button>
        <button className="btn btn-danger" type="button" onClick={deleteDocument} disabled={busy}>
          Delete everything
        </button>
      </div>

      {props.status === "SUPERSEDED" ? (
        <div className="banner warn">
          This report is superseded. Its content is preserved for history. Correct facts or
          regenerate to create a new version.
        </div>
      ) : null}
      {error ? (
        <div className="banner bad" role="alert">
          {error}
        </div>
      ) : null}

      {shareUrl ? (
        <div className="banner info">
          Share link: <a href={shareUrl}>{shareUrl}</a>{" "}
          <button
            className="btn btn-secondary"
            type="button"
            style={{ padding: "4px 8px", fontSize: 12 }}
            onClick={async () => {
              await navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
      {shares.filter((share) => !share.revoked).length > 0 ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Active shares</h3>
          {shares
            .filter((share) => !share.revoked)
            .map((share) => (
              <div className="item-row" key={share.id}>
                <span className="small">
                  Expires {new Date(share.expiresAt).toLocaleString("en-SG")}
                </span>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => revoke(share.id)}
                  disabled={busy}
                >
                  Revoke
                </button>
              </div>
            ))}
        </div>
      ) : null}

      <details className="card" style={{ marginBottom: 18 }}>
        <summary style={{ cursor: "pointer", fontWeight: 650 }}>Draft a message to HR</summary>
        <p className="small muted" style={{ marginTop: 10 }}>
          The draft uses only confirmed facts and deterministic evidence. It never sends
          automatically and never adds a new amount.
        </p>
        <div className="stack">
          {props.questions.map((question) => (
            <label className="check" key={question.id}>
              <input
                type="checkbox"
                checked={selected.includes(question.id)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, question.id]
                      : current.filter((id) => id !== question.id)
                  );
                }}
              />
              {question.text}
            </label>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="button" onClick={generateDraft} disabled={busy}>
            Generate draft
          </button>
        </div>
        {draft ? (
          <div style={{ marginTop: 14 }}>
            <label htmlFor="draft-subject">Subject</label>
            <input id="draft-subject" readOnly value={draft.subject} />
            <label htmlFor="draft-body" style={{ marginTop: 10 }}>
              Message
            </label>
            <textarea id="draft-body" readOnly value={draft.body} style={{ minHeight: 220 }} />
            <button
              className="btn btn-secondary"
              type="button"
              style={{ marginTop: 8 }}
              onClick={() => navigator.clipboard.writeText(draft.body)}
            >
              Copy message
            </button>
          </div>
        ) : null}
      </details>
    </div>
  );
}
