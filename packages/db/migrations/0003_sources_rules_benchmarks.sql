create table sources (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  canonical_url text unique not null,
  purpose text not null,
  refresh_policy text not null,
  max_stale_days int not null default 180 check (max_stale_days > 0)
);

create table source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources (id) on delete restrict,
  content_sha256 text not null,
  snapshot_object_key text not null,
  effective_from date,
  effective_to date,
  checked_at timestamptz not null default now(),
  review_state text not null check (review_state in ('PENDING', 'APPROVED', 'REJECTED')),
  approved_by text,
  approved_at timestamptz,
  extracted jsonb not null default '{}'::jsonb,
  unique (source_id, content_sha256),
  constraint source_versions_effective_order check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  ),
  constraint source_versions_approval_shape check (
    (review_state = 'APPROVED' and approved_by is not null and approved_at is not null)
    or review_state <> 'APPROVED'
  )
);

create index source_versions_pending_review on source_versions (review_state, checked_at)
  where review_state = 'PENDING';

create table rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  semantic_version text not null,
  effective_from date not null,
  effective_to date,
  implementation_sha256 text not null,
  review_state text not null check (review_state in ('DRAFT', 'PENDING', 'APPROVED', 'SUSPENDED')),
  approved_by text,
  approved_at timestamptz,
  fixture jsonb not null default '{}'::jsonb,
  unique (rule_key, semantic_version),
  constraint rule_versions_effective_order check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint rule_versions_approval_shape check (
    (review_state = 'APPROVED' and approved_by is not null and approved_at is not null)
    or review_state <> 'APPROVED'
  )
);

create table rule_source_dependencies (
  rule_version_id uuid not null references rule_versions (id) on delete restrict,
  source_version_id uuid not null references source_versions (id) on delete restrict,
  primary key (rule_version_id, source_version_id)
);

create table benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null,
  version text not null,
  source_version_id uuid not null references source_versions (id) on delete restrict,
  effective_date date not null,
  review_state text not null check (review_state in ('PENDING', 'APPROVED', 'DEMO', 'REJECTED')),
  wage_basis text not null,
  coverage jsonb not null default '{}'::jsonb,
  limitations text not null,
  unique (dataset_key, version)
);

create table occupations (
  snapshot_id uuid not null references benchmark_snapshots (id) on delete cascade,
  occupation_code text not null,
  title text not null,
  industry_code text not null default 'ALL',
  p25_cents bigint check (p25_cents is null or p25_cents >= 0),
  median_cents bigint check (median_cents is null or median_cents >= 0),
  p75_cents bigint check (p75_cents is null or p75_cents >= 0),
  wage_basis text not null,
  coverage jsonb not null default '{}'::jsonb,
  primary key (snapshot_id, occupation_code, industry_code),
  constraint occupations_percentile_order check (
    (p25_cents is null or median_cents is null or p25_cents <= median_cents)
    and (median_cents is null or p75_cents is null or median_cents <= p75_cents)
  )
);

create table occupation_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  confirmed_revision_id uuid not null references confirmed_revisions (id) on delete cascade,
  matcher_version text not null,
  candidates jsonb not null,
  selected_code text,
  selected_by text check (selected_by is null or selected_by in ('USER', 'HIGH_CONFIDENCE_SUGGESTION', 'NONE')),
  confidence_label text not null check (confidence_label in ('HIGH', 'MEDIUM', 'LOW', 'NONE')),
  created_at timestamptz not null default now()
);
