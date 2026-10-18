import { requirePageActor } from "@/lib/auth";
import { ProcessingClient } from "@/components/processing-client";

export default async function ProcessingPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageActor();
  const { id } = await params;
  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <p className="eyebrow">Working</p>
      <h1 style={{ fontSize: 38 }}>Scanning and extracting</h1>
      <p className="lede">
        The file is checked before extraction. Unsafe, encrypted, corrupt, or active-content files
        never reach OCR or a model provider.
      </p>
      <ProcessingClient documentId={id} />
    </div>
  );
}
