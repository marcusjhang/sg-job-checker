import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentActor } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out";

export const metadata: Metadata = {
  title: "Singapore Job Checker",
  description:
    "A structured second opinion on a Singapore offer or employment contract: compensation, CPF, key terms, and official wage context.",
  robots: { index: false, follow: false }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                JC
              </span>
              <span>Singapore Job Checker</span>
            </Link>
            <nav className="nav" aria-label="Main">
              {actor ? (
                <>
                  <Link href="/new">New check</Link>
                  <Link href="/reports">Reports</Link>
                  {actor.isStaff ? <Link href="/sources">Sources</Link> : null}
                  {actor.isStaff ? <Link href="/operations">Operations</Link> : null}
                  <span className="badge neutral" title={actor.authSubject}>
                    {actor.displayName ?? actor.authSubject}
                  </span>
                  <SignOutButton />
                </>
              ) : (
                <>
                  <Link href="/privacy">Privacy</Link>
                  <Link href="/signin">Sign in</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="wrap small muted" style={{ paddingBottom: 40 }}>
          <p>
            Prototype. This is a structured second opinion, not legal, tax, or financial advice.
            Rule fixtures are engineering seeds pending independent employment-domain sign-off.
          </p>
        </footer>
      </body>
    </html>
  );
}
