"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { screenInitialScope, type ScopeDecision } from "@job-checker/contracts/scope";
import { apiFetch } from "@/lib/client";
import { PrivacyNoticeBody } from "./privacy-notice";

type Step = 1 | 2 | 3;

type ScopeState = {
  residency: "CITIZEN" | "PR" | "OTHER";
  dateOfBirth: string;
  monthlySalary: string;
  englishDocument: boolean;
  shiftWork: boolean;
  commissionDominant: boolean;
  needsEquityOrTaxAdvice: boolean;
  needsWorkPassOrForeignWorkerAdvice: boolean;
};

const initialScope: ScopeState = {
  residency: "CITIZEN",
  dateOfBirth: "",
  monthlySalary: "",
  englishDocument: true,
  shiftWork: false,
  commissionDominant: false,
  needsEquityOrTaxAdvice: false,
  needsWorkPassOrForeignWorkerAdvice: false
};

export function NewCheckWizard(props: {
  policyId: string;
  policyVersion: string;
  policyMarkdown: string;
  policyHash: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [scope, setScope] = useState<ScopeState>(initialScope);
  const [decision, setDecision] = useState<ScopeDecision | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [kind, setKind] = useState<"OFFER" | "CONTRACT">("OFFER");
  const [mode, setMode] = useState<"MANUAL" | "UPLOAD">("MANUAL");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scopeValid = scope.dateOfBirth.length === 10 && scope.monthlySalary.trim().length > 0;

  async function acceptPolicy(): Promise<string> {
    const result = await apiFetch<{ acceptanceId: string }>("/api/policies/accept", {
      method: "POST",
      json: { policyVersionId: props.policyId }
    });
    return result.acceptanceId;
  }

  async function createManual(): Promise<void> {
    const acceptanceId = await acceptPolicy();
    const operationKey = crypto.randomUUID();
    const result = await apiFetch<{ documentId: string }>("/api/documents/manual", {
      method: "POST",
      json: { kind, policyAcceptanceId: acceptanceId, operationKey }
    });
    router.push(`/documents/${result.documentId}/review`);
  }

  async function createUpload(): Promise<void> {
    if (!file) throw new Error("Choose a PDF, JPEG, or PNG file first.");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      throw new Error("Only PDF, JPEG, and PNG files are accepted.");
    }
    if (file.size > 20 * 1024 * 1024) throw new Error("The file exceeds the 20 MB limit.");
    const acceptanceId = await acceptPolicy();
    const operationKey = crypto.randomUUID();
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const sha256 = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const intent = await apiFetch<{
      intentId: string;
      documentId: string;
      uploadToken: string;
      uploadUrl: string;
    }>("/api/uploads", {
      method: "POST",
      json: {
        operationKey,
        policyAcceptanceId: acceptanceId,
        kind,
        fileName: file.name,
        contentType: file.type,
        byteSize: file.size,
        sha256
      }
    });
    const put = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.type, "x-upload-token": intent.uploadToken },
      body: file
    });
    if (!put.ok) {
      const body = await put.json().catch(() => ({}));
      throw new Error(body.message ?? "Upload failed");
    }
    await apiFetch(`/api/uploads/${intent.intentId}/complete`, {
      method: "POST",
      json: { operationKey }
    });
    router.push(`/documents/${intent.documentId}/processing`);
  }

  return (
    <div style={{ marginTop: 24 }}>
      <ol className="small muted" style={{ display: "flex", gap: 18, paddingLeft: 18 }}>
        <li aria-current={step === 1 ? "step" : undefined}>Scope</li>
        <li aria-current={step === 2 ? "step" : undefined}>Privacy</li>
        <li aria-current={step === 3 ? "step" : undefined}>Document</li>
      </ol>

      {step === 1 ? (
        <section className="card" aria-labelledby="scope-heading">
          <h2 id="scope-heading" style={{ fontSize: 24 }}>
            Is this release the right fit?
          </h2>
          <p className="small muted">
            These answers are used only to screen this session. They are not saved until you confirm
            facts in the document, and they are never sent to analytics.
          </p>
          <div className="field-row">
            <div className="field">
              <label htmlFor="residency">Residency</label>
              <select
                id="residency"
                value={scope.residency}
                onChange={(event) =>
                  setScope({ ...scope, residency: event.target.value as ScopeState["residency"] })
                }
              >
                <option value="CITIZEN">Singapore Citizen</option>
                <option value="PR">Singapore PR</option>
                <option value="OTHER">Other / not sure</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="dob">Date of birth</label>
              <input
                id="dob"
                type="date"
                value={scope.dateOfBirth}
                onChange={(event) => setScope({ ...scope, dateOfBirth: event.target.value })}
              />
              <p className="hint">Used for CPF age bands after confirmation.</p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="salary">Monthly basic salary (S$)</label>
            <input
              id="salary"
              inputMode="decimal"
              placeholder="e.g. 6500"
              value={scope.monthlySalary}
              onChange={(event) => setScope({ ...scope, monthlySalary: event.target.value })}
            />
            <p className="hint">
              Designed range S$2,500–S$12,000. S$2,000–S$15,000 is accepted with a warning.
            </p>
          </div>
          <div className="stack">
            <label className="check">
              <input
                type="checkbox"
                checked={scope.englishDocument}
                onChange={(event) => setScope({ ...scope, englishDocument: event.target.checked })}
              />
              The document is in English.
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={scope.shiftWork}
                onChange={(event) => setScope({ ...scope, shiftWork: event.target.checked })}
              />
              This is a shift-work role.
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={scope.commissionDominant}
                onChange={(event) =>
                  setScope({ ...scope, commissionDominant: event.target.checked })
                }
              />
              Most pay is commission-based.
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={scope.needsEquityOrTaxAdvice}
                onChange={(event) =>
                  setScope({ ...scope, needsEquityOrTaxAdvice: event.target.checked })
                }
              />
              I need equity valuation or tax advice.
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={scope.needsWorkPassOrForeignWorkerAdvice}
                onChange={(event) =>
                  setScope({ ...scope, needsWorkPassOrForeignWorkerAdvice: event.target.checked })
                }
              />
              I need work-pass or foreign-worker advice.
            </label>
          </div>

          {decision ? (
            <div className="stack" style={{ marginTop: 16 }} role="status">
              {decision.stops.length > 0 ? (
                <div className="banner bad">
                  <strong>This release cannot check this document.</strong>
                  <ul>
                    {decision.stops.map((stop) => (
                      <li key={stop}>{stop}</li>
                    ))}
                  </ul>
                  {decision.referrals.length > 0 ? (
                    <p className="small">
                      Official guidance:{" "}
                      {decision.referrals.map((referral, index) => (
                        <span key={referral.url}>
                          {index > 0 ? ", " : ""}
                          <a href={referral.url}>{referral.label}</a>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {decision.warnings.map((warning) => (
                <div className="banner warn" key={warning}>
                  {warning}
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="banner bad" role="alert">
              {error}
            </div>
          ) : null}

          <div className="btn-row">
            <button
              className="btn btn-primary"
              type="button"
              disabled={!scopeValid}
              onClick={() => {
                setError(null);
                const result = screenInitialScope(scope);
                setDecision(result);
                if (result.allowed) setStep(2);
              }}
            >
              Check fit and continue
            </button>
            <a className="btn btn-secondary" href="/">
              Cancel
            </a>
          </div>
          <p className="hint" style={{ marginTop: 14 }}>
            Payslip and compare-offers entry points are disabled until Phase 2.
          </p>
          <div className="grid two" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" disabled>
              Payslip — coming later
            </button>
            <button className="btn btn-secondary" disabled>
              Compare offers — coming later
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="card" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" style={{ fontSize: 24 }}>
            Privacy and retention (v{props.policyVersion})
          </h2>
          <div
            style={{
              maxHeight: 340,
              overflow: "auto",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: 16,
              background: "#fff"
            }}
            tabIndex={0}
            aria-label="Privacy and retention notice"
          >
            <PrivacyNoticeBody markdown={props.policyMarkdown} />
          </div>
          <p className="mono muted" style={{ marginTop: 10 }}>
            Policy hash {props.policyHash.slice(0, 20)}…
          </p>
          <label className="check" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            I have read the current privacy and retention notice and I am authorised to submit this
            document or these facts.
          </label>
          {error ? (
            <div className="banner bad" role="alert">
              {error}
            </div>
          ) : null}
          <div className="btn-row">
            <button className="btn btn-secondary" type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!accepted}
              onClick={() => setStep(3)}
            >
              Accept and continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="card" aria-labelledby="document-heading">
          <h2 id="document-heading" style={{ fontSize: 24 }}>
            Add the document
          </h2>
          <div className="field">
            <label htmlFor="kind">Document type</label>
            <select
              id="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <option value="OFFER">Offer letter</option>
              <option value="CONTRACT">Employment contract</option>
            </select>
          </div>
          <fieldset className="field" style={{ border: "none", padding: 0 }}>
            <legend style={{ fontWeight: 650, fontSize: 13, marginBottom: 6 }}>
              How do you want to enter it?
            </legend>
            <label className="check">
              <input
                type="radio"
                name="mode"
                checked={mode === "MANUAL"}
                onChange={() => setMode("MANUAL")}
              />
              Enter the facts manually (fastest, no raw document retained)
            </label>
            <label className="check" style={{ marginTop: 8 }}>
              <input
                type="radio"
                name="mode"
                checked={mode === "UPLOAD"}
                onChange={() => setMode("UPLOAD")}
              />
              Upload a clean PDF, JPEG, or PNG (max 20 MB)
            </label>
          </fieldset>

          {mode === "UPLOAD" ? (
            <div className="field">
              <label htmlFor="file">Document file</label>
              <input
                id="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <p className="hint">
                Encrypted files, active PDF content, and suspicious files are quarantined before any
                extraction.
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="banner bad" role="alert">
              {error}
            </div>
          ) : null}

          <div className="btn-row">
            <button className="btn btn-secondary" type="button" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !accepted || (mode === "UPLOAD" && !file)}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  if (!accepted) throw new Error("Accept the current privacy notice first.");
                  if (mode === "MANUAL") await createManual();
                  else await createUpload();
                } catch (caught) {
                  setError(
                    caught instanceof Error ? caught.message : "Could not create the document"
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Working…" : mode === "MANUAL" ? "Create and enter facts" : "Upload and scan"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
