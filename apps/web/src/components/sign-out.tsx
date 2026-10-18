"use client";

import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ padding: "7px 12px", fontSize: 13 }}
      onClick={async () => {
        try {
          await apiFetch("/api/auth/logout", { method: "POST", json: {} });
        } finally {
          router.push("/");
          router.refresh();
        }
      }}
    >
      Sign out
    </button>
  );
}
