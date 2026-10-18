create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in (
    'SCAN_DOCUMENT', 'EXTRACT_DOCUMENT', 'DELETE_DOCUMENT',
    'EXPIRE_RETENTION', 'CHECK_SOURCE', 'INGEST_BENCHMARK', 'MARK_AFFECTED_REPORTS'
  )),
  subject_id uuid not null,
  subject_version bigint not null,
  occurrence_key uuid not null,
  state text not null check (state in ('PENDING', 'LEASED', 'RETRY', 'COMPLETED', 'FAILED', 'CANCELLED')),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count int not null default 0 check (attempt_count >= 0),
  max_attempts int not null default 3 check (max_attempts > 0),
  last_error_code text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, kind, occurrence_key),
  constraint jobs_lease_shape check (
    (state = 'LEASED' and lease_owner is not null and lease_expires_at is not null)
    or (state <> 'LEASED' and lease_owner is null and lease_expires_at is null)
  )
);

create index jobs_pending on jobs (state, available_at)
  where state in ('PENDING', 'RETRY');
create index jobs_lease_expiry on jobs (lease_expires_at)
  where state = 'LEASED';
create index jobs_subject on jobs (subject_id, kind);

create table extraction_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  document_version bigint not null,
  revision int not null check (revision >= 1),
  schema_version text not null,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, revision)
);

create table extracted_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  extraction_revision_id uuid not null references extraction_revisions (id) on delete cascade,
  field_key text not null,
  value jsonb,
  status text not null check (status in ('PRESENT', 'ABSENT', 'UNREADABLE', 'UNCERTAIN')),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  page_number int check (page_number is null or page_number >= 1),
  source_span_ciphertext bytea,
  created_at timestamptz not null default now(),
  unique (extraction_revision_id, field_key)
);

create table confirmed_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  extraction_revision_id uuid references extraction_revisions (id) on delete set null,
  revision int not null check (revision >= 1),
  facts jsonb not null,
  facts_schema_version text not null,
  facts_sha256 text not null,
  confirmation_manifest jsonb not null,
  created_at timestamptz not null default now(),
  unique (document_id, revision)
);

create index confirmed_revisions_latest on confirmed_revisions (document_id, revision desc);
