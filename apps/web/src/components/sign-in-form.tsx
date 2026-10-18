"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await apiFetch("/api/auth/dev", { method: "POST", json: { email, name } });
          router.push(next);
          router.refresh();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Sign in failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
        <p className="hint">
          Use a real mailbox only if you want correspondence; this prototype does not send email.
        </p>
      </div>
      <div className="field">
        <label htmlFor="name">Display name (optional)</label>
        <input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {error ? (
        <div className="banner bad" role="alert">
          {error}
        </div>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
