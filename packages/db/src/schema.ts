import type { ColumnType, Generated } from "kysely";

export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type Json = unknown;

export interface UsersTable {
  id: Generated<string>;
  auth_subject: string;
  display_name: string | null;
  is_staff: boolean;
  session_invalid_before: Timestamp | null;
  created_at: Generated<Date>;
}

export interface PolicyVersionsTable {
  id: Generated<string>;
  policy_key: string;
  version: string;
  content_sha256: string;
  body_markdown: string;
  effective_from: Timestamp;
  retired_at: Timestamp | null;
}

export interface PolicyAcceptancesTable {
  id: Generated<string>;
  user_id: string;
  policy_version_id: string;
  accepted_at: Generated<Date>;
  method: string;
}

export interface DocumentsTable {
  id: Generated<string>;
  user_id: string;
  kind: "OFFER" | "CONTRACT";
  state: string;
  version: string;
  original_name_ciphertext: Buffer | null;
  media_type: string | null;
  byte_size: string | null;
  sha256: string | null;
  object_key: string | null;
  policy_acceptance_id: string;
  operation_key: string | null;
  origin: "UPLOAD" | "MANUAL";
  retention_expires_at: Timestamp | null;
  created_at: Generated<Date>;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface DocumentPagesTable {
  id: Generated<string>;
  user_id: string;
  document_id: string;
  document_version: string;
  page_number: number;
  text_ciphertext: Buffer | null;
  image_object_key: string | null;
  sha256: string;
  created_at: Generated<Date>;
}

export interface ScanFindingsTable {
  id: Generated<string>;
  user_id: string;
  document_id: string;
  document_version: string;
  scanner_version: string;
  verdict: "CLEAN" | "QUARANTINED" | "NEEDS_INPUT";
  reason_code: string | null;
  created_at: Generated<Date>;
}

export interface UploadIntentsTable {
  id: Generated<string>;
  user_id: string;
  operation_key: string;
  document_id: string;
  kind: "OFFER" | "CONTRACT";
  policy_acceptance_id: string;
  original_name_ciphertext: Buffer;
  object_key: string;
  content_type: string;
  declared_bytes: string;
  expected_sha256: string | null;
  actual_sha256: string | null;
  expires_at: Timestamp;
  consumed_at: Timestamp | null;
  object_written_at: Timestamp | null;
  created_at: Generated<Date>;
}

export interface JobsTable {
  id: Generated<string>;
  user_id: string;
  kind: string;
  subject_id: string;
  subject_version: string;
  occurrence_key: string;
  state: "PENDING" | "LEASED" | "RETRY" | "COMPLETED" | "FAILED" | "CANCELLED";
  available_at: Generated<Date>;
  lease_owner: string | null;
  lease_expires_at: Timestamp | null;
  attempt_count: number;
  max_attempts: number;
  last_error_code: string | null;
  payload: Json;
  created_at: Generated<Date>;
  completed_at: Timestamp | null;
}

export interface ExtractionRevisionsTable {
  id: Generated<string>;
  user_id: string;
  document_id: string;
  document_version: string;
  revision: number;
  schema_version: string;
  provider_metadata: Json;
  created_at: Generated<Date>;
}

export interface ExtractedFieldsTable {
  id: Generated<string>;
  user_id: string;
  extraction_revision_id: string;
  field_key: string;
  value: Json;
  status: "PRESENT" | "ABSENT" | "UNREADABLE" | "UNCERTAIN";
  confidence: string | null;
  page_number: number | null;
  source_span_ciphertext: Buffer | null;
  created_at: Generated<Date>;
}

export interface ConfirmedRevisionsTable {
  id: Generated<string>;
  user_id: string;
  document_id: string;
  extraction_revision_id: string | null;
  revision: number;
  facts: Json;
  facts_schema_version: string;
  facts_sha256: string;
  confirmation_manifest: Json;
  created_at: Generated<Date>;
}

export interface SourcesTable {
  id: Generated<string>;
  owner: string;
  canonical_url: string;
  purpose: string;
  refresh_policy: string;
  max_stale_days: number;
}

export interface SourceVersionsTable {
  id: Generated<string>;
  source_id: string;
  content_sha256: string;
  snapshot_object_key: string;
  effective_from: string | null;
  effective_to: string | null;
  checked_at: Generated<Date>;
  review_state: "PENDING" | "APPROVED" | "REJECTED";
  approved_by: string | null;
  approved_at: Timestamp | null;
  extracted: Json;
}

export interface RuleVersionsTable {
  id: Generated<string>;
  rule_key: string;
  semantic_version: string;
  effective_from: string;
  effective_to: string | null;
  implementation_sha256: string;
  review_state: "DRAFT" | "PENDING" | "APPROVED" | "SUSPENDED";
  approved_by: string | null;
  approved_at: Timestamp | null;
  fixture: Json;
}

export interface RuleSourceDependenciesTable {
  rule_version_id: string;
  source_version_id: string;
}

export interface BenchmarkSnapshotsTable {
  id: Generated<string>;
  dataset_key: string;
  version: string;
  source_version_id: string;
  effective_date: string;
  review_state: "PENDING" | "APPROVED" | "DEMO" | "REJECTED";
  wage_basis: string;
  coverage: Json;
  limitations: string;
}

export interface OccupationsTable {
  snapshot_id: string;
  occupation_code: string;
  title: string;
  industry_code: string;
  p25_cents: string | null;
  median_cents: string | null;
  p75_cents: string | null;
  wage_basis: string;
  coverage: Json;
}

export interface OccupationMatchesTable {
  id: Generated<string>;
  user_id: string;
  confirmed_revision_id: string;
  matcher_version: string;
  candidates: Json;
  selected_code: string | null;
  selected_by: string | null;
  confidence_label: string;
  created_at: Generated<Date>;
}

export interface GenerationRequestsTable {
  id: Generated<string>;
  user_id: string;
  document_id: string;
  operation_key: string;
  confirmed_revision_id: string;
  requested_period: string;
  inputs_sha256: string;
  state: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  report_id: string | null;
  error_code: string | null;
  created_at: Generated<Date>;
  completed_at: Timestamp | null;
}

export interface ReportsTable {
  id: Generated<string>;
  user_id: string;
  document_id: string;
  lineage_id: string;
  version: number;
  confirmed_revision_id: string;
  status: "GENERATED" | "SUPERSEDED";
  rendered_json: Json;
  manifest: Json;
  partial_coverage: Generated<boolean>;
  created_at: Generated<Date>;
  superseded_at: Timestamp | null;
}

export interface EvidenceTable {
  id: Generated<string>;
  user_id: string;
  report_id: string;
  category: string;
  key: string;
  inputs: Json;
  output: Json;
  steps: Json;
  rule_version_id: string | null;
  benchmark_snapshot_id: string | null;
  source_version_ids: string[];
  effective_date: string;
  applicability: Json;
  warnings: Json;
}

export interface ReportDependenciesTable {
  report_id: string;
  dependency_type: string;
  dependency_id: string;
}

export interface SharesTable {
  id: Generated<string>;
  user_id: string;
  report_id: string;
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  created_at: Generated<Date>;
}

export interface DeletionReceiptsTable {
  id: Generated<string>;
  subject_hash: string;
  requested_at: Timestamp;
  completed_at: Timestamp;
  stores_checked: string[];
  outstanding_expiry: Timestamp | null;
  detail: Json;
}

export interface AuditRecordsTable {
  id: Generated<string>;
  user_id: string | null;
  actor_type: string;
  actor_id_hash: string | null;
  action: string;
  subject_type: string;
  subject_id_hash: string;
  result: string;
  metadata: Json;
  created_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  policy_versions: PolicyVersionsTable;
  policy_acceptances: PolicyAcceptancesTable;
  documents: DocumentsTable;
  document_pages: DocumentPagesTable;
  scan_findings: ScanFindingsTable;
  upload_intents: UploadIntentsTable;
  jobs: JobsTable;
  extraction_revisions: ExtractionRevisionsTable;
  extracted_fields: ExtractedFieldsTable;
  confirmed_revisions: ConfirmedRevisionsTable;
  sources: SourcesTable;
  source_versions: SourceVersionsTable;
  rule_versions: RuleVersionsTable;
  rule_source_dependencies: RuleSourceDependenciesTable;
  benchmark_snapshots: BenchmarkSnapshotsTable;
  occupations: OccupationsTable;
  occupation_matches: OccupationMatchesTable;
  generation_requests: GenerationRequestsTable;
  reports: ReportsTable;
  evidence: EvidenceTable;
  report_dependencies: ReportDependenciesTable;
  shares: SharesTable;
  deletion_receipts: DeletionReceiptsTable;
  audit_records: AuditRecordsTable;
}

export type DocumentRow = import("kysely").Selectable<DocumentsTable>;
export type ReportRow = import("kysely").Selectable<ReportsTable>;
