create table deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  subject_hash text not null,
  requested_at timestamptz not null,
  completed_at timestamptz not null default now(),
  stores_checked text[] not null,
  outstanding_expiry timestamptz,
  detail jsonb not null default '{}'::jsonb
);

create table audit_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  actor_type text not null check (actor_type in ('USER', 'STAFF', 'SYSTEM', 'WORKER')),
  actor_id_hash text,
  action text not null,
  subject_type text not null,
  subject_id_hash text not null,
  result text not null check (result in ('SUCCESS', 'FAILURE', 'DENIED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_records_by_subject on audit_records (subject_type, subject_id_hash, created_at desc);
create index audit_records_by_action on audit_records (action, created_at desc);
