"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/client";

type State = {
  state: string;
  scan: { verdict: string; reasonCode: string | null } | null;
};

export function ProcessingClient({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const result = await apiFetch<State>(`/api/documents/${documentId}`);
        if (cancelled) return;
        setState(result);
        if (result.state === "USER_REVIEW" || result.state === "READY") {
          router.push(`/documents/${documentId}/review`);
          return;
        }
        if (["QUARANTINED", "FAILED", "DELETION_PENDING", "DELETED"].includes(result.state)) return;
        setTicks((current) => current + 1);
        timer = setTimeout(poll, 1500);
      } catch (caught) {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : "Could not check the document");
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [documentId, router]);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <p>
        State: <strong>{state?.state ?? "loading"}</strong>
        {ticks > 6 ? " · still working, this can take a few minutes" : ""}
      </p>
      <div className="progress">
        <span className="dot" /> encrypted storage
        <span className="dot" /> scan
        <span className="dot" /> extract
        <span className="dot" /> review
      </div>
      {state?.scan?.verdict === "QUARANTINED" ? (
        <div className="banner bad" role="alert">
          This file was quarantined ({state.scan.reasonCode ?? "unsafe"}). It was not sent to
          extraction. Delete it and enter the facts manually, or upload a clean text PDF.
        </div>
      ) : null}
      {state?.state === "FAILED" ? (
        <div className="banner bad" role="alert">
          Extraction failed. Delete this document and enter the facts manually, or upload a clean
          text PDF.
        </div>
      ) : null}
      {error ? (
        <div className="banner bad" role="alert">
          {error}
        </div>
      ) : null}
      {state?.state === "NEEDS_INPUT" ? (
        <div className="banner warn">
          No usable text was found. You can still continue to review and enter the facts manually.
          <div className="btn-row">
            <Link className="btn btn-primary" href={`/documents/${documentId}/review`}>
              Enter facts manually
            </Link>
          </div>
        </div>
      ) : null}
      {state && ["QUARANTINED", "FAILED", "NEEDS_INPUT"].includes(state.state) ? (
        <div className="btn-row">
          <Link className="btn btn-secondary" href="/new">
            Start a manual check
          </Link>
        </div>
      ) : null}
    </div>
  );
}
