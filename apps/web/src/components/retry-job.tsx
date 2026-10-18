"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        className="btn btn-secondary"
        style={{ padding: "5px 10px", fontSize: 12 }}
        type="button"
        disabled={busy}
        onClick={async () => {
          const reason = window.prompt("Reason for retrying this job (recorded in the audit log):");
          if (!reason) return;
          setBusy(true);
          setError(null);
          try {
            await apiFetch(`/internal/jobs/${jobId}/retry`, { method: "POST", json: { reason } });
            router.refresh();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Retry failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : "Retry"}
      </button>
      {error ? (
        <span className="small" style={{ color: "var(--red)" }}>
          {" "}
          {error}
        </span>
      ) : null}
    </span>
  );
}
