import { currentPolicy } from "@job-checker/documents";
import { getDb } from "@job-checker/db";
import { PrivacyNoticeBody } from "@/components/privacy-notice";

export default async function PrivacyPage() {
  const policy = await currentPolicy(getDb());
  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <p className="eyebrow">Privacy</p>
      <h1 style={{ fontSize: 38 }}>Privacy and retention</h1>
      <p className="lede">
        Version {policy.version}. Effective{" "}
        {new Date(policy.effective_from).toLocaleDateString("en-SG")}.
      </p>
      <div className="card">
        <PrivacyNoticeBody markdown={policy.body_markdown} />
      </div>
      <p className="mono small muted" style={{ marginTop: 14 }}>
        Content hash: {policy.content_sha256}
      </p>
    </div>
  );
}
