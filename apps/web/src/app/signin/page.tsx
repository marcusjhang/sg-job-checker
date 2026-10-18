import Link from "next/link";
import { SignInForm } from "@/components/sign-in-form";
import { env } from "@job-checker/observability/env";
import { PRIVACY_NOTICE_VERSION } from "@job-checker/contracts";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/new";
  return (
    <div className="wrap" style={{ maxWidth: 560, paddingTop: 30 }}>
      <p className="eyebrow">Sign in</p>
      <h1 style={{ fontSize: 38 }}>Continue to your check</h1>
      <p className="lede">
        Phase 1A uses a development identity adapter. Production uses an OIDC provider behind the
        same session interface. Your email identifies your private workspace.
      </p>
      <div className="card" style={{ marginTop: 24 }}>
        <SignInForm next={next} />
        <p className="hint" style={{ marginTop: 16 }}>
          Current privacy notice: v{PRIVACY_NOTICE_VERSION}. You will accept it explicitly before a
          document is created.
        </p>
        {env().AUTH_MODE !== "dev" ? (
          <div className="banner warn">
            OIDC mode is configured but no external provider is wired in this prototype. Set
            AUTH_MODE=dev for local use.
          </div>
        ) : null}
      </div>
      <p className="small muted" style={{ marginTop: 18 }}>
        <Link href="/privacy">Privacy and retention notice</Link>
      </p>
    </div>
  );
}
