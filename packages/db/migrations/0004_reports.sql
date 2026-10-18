create table generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  operation_key uuid not null,
  confirmed_revision_id uuid not null references confirmed_revisions (id) on delete restrict,
  requested_period date not null,
  inputs_sha256 text not null,
  state text not null check (state in ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  report_id uuid,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, operation_key)
);

create index generation_requests_by_document on generation_requests (document_id, created_at desc);

create table reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  lineage_id uuid not null,
  version int not null check (version >= 1),
  confirmed_revision_id uuid not null references confirmed_revisions (id) on delete restrict,
  status text not null check (status in ('GENERATED', 'SUPERSEDED')),
  rendered_json jsonb not null,
  manifest jsonb not null,
  partial_coverage boolean not null default false,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint reports_superseded_shape check (
    (status = 'SUPERSEDED' and superseded_at is not null) or status = 'GENERATED'
  ),
  unique (lineage_id, version)
);

create index reports_by_user on reports (user_id, created_at desc);
create index reports_by_document on reports (document_id, created_at desc);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  report_id uuid not null references reports (id) on delete cascade,
  category text not null check (category in ('COMPENSATION', 'CPF', 'KET', 'EMPLOYMENT_ACT', 'BENCHMARK', 'OBSERVATION')),
  key text not null,
  inputs jsonb not null,
  output jsonb not null,
  steps jsonb not null,
  rule_version_id uuid references rule_versions (id) on delete restrict,
  benchmark_snapshot_id uuid references benchmark_snapshots (id) on delete restrict,
  source_version_ids uuid[] not null default '{}',
  effective_date date not null,
  applicability jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  unique (report_id, category, key)
);

create table report_dependencies (
  report_id uuid not null references reports (id) on delete cascade,
  dependency_type text not null check (dependency_type in ('RULE', 'SOURCE', 'BENCHMARK', 'CONFIRMED_REVISION')),
  dependency_id uuid not null,
  primary key (report_id, dependency_type, dependency_id)
);

create index report_dependencies_lookup on report_dependencies (dependency_type, dependency_id);

create table shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  report_id uuid not null references reports (id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index shares_active_lookup on shares (token_hash)
  where revoked_at is null;
