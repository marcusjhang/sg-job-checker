import { requirePageActor } from "@/lib/auth";
import { currentPolicy } from "@job-checker/documents";
import { getDb } from "@job-checker/db";
import { NewCheckWizard } from "@/components/new-check-wizard";

export default async function NewCheckPage() {
  await requirePageActor("/new");
  const policy = await currentPolicy(getDb());
  return (
    <div className="wrap" style={{ maxWidth: 920 }}>
      <p className="eyebrow">New check</p>
      <h1 style={{ fontSize: 40 }}>Offer or contract</h1>
      <p className="lede">
        Three steps: confirm this release fits, accept the privacy notice, then enter facts or
        upload a clean PDF. Nothing is calculated until you explicitly confirm every critical field.
      </p>
      <NewCheckWizard
        policyId={policy.id}
        policyVersion={policy.version}
        policyMarkdown={policy.body_markdown}
        policyHash={policy.content_sha256}
      />
    </div>
  );
}
