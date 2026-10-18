create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  auth_subject text unique not null,
  display_name text,
  is_staff boolean not null default false,
  session_invalid_before timestamptz,
  created_at timestamptz not null default now()
);

create table policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version text not null,
  content_sha256 text not null,
  body_markdown text not null,
  effective_from timestamptz not null,
  retired_at timestamptz,
  unique (policy_key, version)
);

create table policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  policy_version_id uuid not null references policy_versions (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  method text not null,
  unique (user_id, policy_version_id)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('OFFER', 'CONTRACT')),
  state text not null check (state in (
    'UPLOADED', 'SCANNING', 'EXTRACTED', 'USER_REVIEW', 'NEEDS_INPUT',
    'READY', 'GENERATED', 'SUPERSEDED', 'REGENERATED', 'QUARANTINED',
    'FAILED', 'DELETION_PENDING', 'DELETED'
  )),
  version bigint not null default 1 check (version > 0),
  original_name_ciphertext bytea,
  media_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sha256 text,
  object_key text,
  policy_acceptance_id uuid not null references policy_acceptances (id) on delete restrict,
  operation_key uuid,
  origin text not null check (origin in ('UPLOAD', 'MANUAL')),
  retention_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint documents_origin_shape check (
    (origin = 'UPLOAD' and original_name_ciphertext is not null and media_type is not null
      and byte_size is not null and sha256 is not null and object_key is not null)
    or
    (origin = 'MANUAL' and original_name_ciphertext is null and media_type is null
      and byte_size is null and sha256 is null and object_key is null)
  ),
  constraint documents_operation_unique unique (user_id, operation_key),
  constraint documents_deleted_shape check (
    (state = 'DELETED' and deleted_at is not null) or (state <> 'DELETED')
  )
);

create index documents_active_by_user on documents (user_id, updated_at desc)
  where state <> 'DELETED';
create index documents_retention on documents (retention_expires_at)
  where retention_expires_at is not null and state <> 'DELETED';

create table document_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  document_version bigint not null,
  page_number int not null check (page_number >= 1),
  text_ciphertext bytea,
  image_object_key text,
  sha256 text not null,
  created_at timestamptz not null default now(),
  unique (document_id, document_version, page_number)
);

create table scan_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  document_version bigint not null,
  scanner_version text not null,
  verdict text not null check (verdict in ('CLEAN', 'QUARANTINED', 'NEEDS_INPUT')),
  reason_code text,
  created_at timestamptz not null default now()
);

create index scan_findings_by_document on scan_findings (document_id, created_at desc);

create table upload_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  operation_key uuid not null,
  document_id uuid not null,
  kind text not null check (kind in ('OFFER', 'CONTRACT')),
  policy_acceptance_id uuid not null references policy_acceptances (id) on delete restrict,
  original_name_ciphertext bytea not null,
  object_key text not null unique,
  content_type text not null,
  declared_bytes bigint not null check (declared_bytes > 0),
  expected_sha256 text,
  actual_sha256 text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  object_written_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, operation_key)
);

create index upload_intents_expiry on upload_intents (expires_at)
  where consumed_at is null;
