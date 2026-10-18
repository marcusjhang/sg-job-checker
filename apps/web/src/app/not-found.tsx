import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap" style={{ maxWidth: 620, paddingTop: 40 }}>
      <p className="eyebrow">Not found</p>
      <h1 style={{ fontSize: 38 }}>That page is not available</h1>
      <p className="lede">
        The link may have expired, been revoked, or belong to another account. We do not reveal
        whether another user&apos;s document exists.
      </p>
      <div className="btn-row">
        <Link className="btn btn-primary" href="/">
          Return home
        </Link>
        <Link className="btn btn-secondary" href="/reports">
          Your reports
        </Link>
      </div>
    </div>
  );
}
