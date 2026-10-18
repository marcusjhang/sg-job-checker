import { notFound } from "next/navigation";
import { getDb } from "@job-checker/db";
import { resolveShare } from "@job-checker/reports";
import type { ReportRenderModel } from "@job-checker/contracts";
import { ReportView } from "@/components/report-view";

export const dynamic = "force-dynamic";

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let row;
  try {
    row = await resolveShare(getDb(), token);
  } catch {
    notFound();
  }
  const model = row.rendered_json as ReportRenderModel;
  return (
    <div className="wrap" style={{ maxWidth: 980 }}>
      <div className="banner info">
        View-only shared report. The owner can revoke this link at any time. The link expires{" "}
        {row.expires_at.toLocaleString("en-SG")}.
      </div>
      <ReportView model={model} evidence={[]} publicView />
    </div>
  );
}
