create or replace function is_deletion_mode() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.deletion', true), '') = 'on'
$$;

create or replace function reject_immutable_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and is_deletion_mode() then
    return old;
  end if;
  raise exception 'immutable row: % on %', tg_op, tg_table_name using errcode = '23514';
end;
$$;

create or replace function protect_approved_source_version() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'source versions are immutable' using errcode = '23514';
  end if;
  if old.review_state = 'APPROVED' then
    raise exception 'approved source versions are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function protect_published_rule_version() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'rule versions are immutable' using errcode = '23514';
  end if;
  if old.review_state = 'APPROVED' then
    if new.review_state = 'SUSPENDED'
       and (to_jsonb(old) - 'review_state') = (to_jsonb(new) - 'review_state') then
      return new;
    end if;
    raise exception 'approved rule versions are immutable; create a successor' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function protect_report_content() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if is_deletion_mode() then return old; end if;
    raise exception 'reports are immutable; use deletion workflow' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(old) - 'status' - 'superseded_at') = (to_jsonb(new) - 'status' - 'superseded_at')
       and new.status in ('GENERATED', 'SUPERSEDED') then
      return new;
    end if;
    raise exception 'report content is immutable; regenerate a new version' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function protect_policy_version() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'policy versions are immutable' using errcode = '23514';
  end if;
  if old.policy_key <> new.policy_key
     or old.version <> new.version
     or old.content_sha256 <> new.content_sha256
     or old.body_markdown <> new.body_markdown
     or old.effective_from <> new.effective_from then
    raise exception 'published policy content is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger source_versions_guard
  before update or delete on source_versions
  for each row execute function protect_approved_source_version();

create trigger rule_versions_guard
  before update or delete on rule_versions
  for each row execute function protect_published_rule_version();

create trigger confirmed_revisions_guard
  before update or delete on confirmed_revisions
  for each row execute function reject_immutable_mutation();

create trigger evidence_guard
  before update or delete on evidence
  for each row execute function reject_immutable_mutation();

create trigger reports_guard
  before update or delete on reports
  for each row execute function protect_report_content();

create trigger policy_versions_guard
  before update or delete on policy_versions
  for each row execute function protect_policy_version();

create or replace function enforce_document_transition() returns trigger
language plpgsql as $$
declare
  allowed boolean := false;
begin
  if old.state = new.state then return new; end if;
  allowed := case old.state
    when 'UPLOADED' then new.state in ('SCANNING', 'QUARANTINED', 'DELETION_PENDING', 'FAILED')
    when 'SCANNING' then new.state in ('EXTRACTED', 'QUARANTINED', 'NEEDS_INPUT', 'FAILED', 'DELETION_PENDING')
    when 'EXTRACTED' then new.state in ('USER_REVIEW', 'DELETION_PENDING', 'FAILED')
    when 'USER_REVIEW' then new.state in ('READY', 'DELETION_PENDING', 'FAILED')
    when 'NEEDS_INPUT' then new.state in ('USER_REVIEW', 'DELETION_PENDING', 'FAILED')
    when 'READY' then new.state in ('GENERATED', 'USER_REVIEW', 'DELETION_PENDING', 'FAILED')
    when 'GENERATED' then new.state in ('SUPERSEDED', 'REGENERATED', 'READY', 'DELETION_PENDING')
    when 'SUPERSEDED' then new.state in ('REGENERATED', 'READY', 'DELETION_PENDING')
    when 'REGENERATED' then new.state in ('SUPERSEDED', 'READY', 'DELETION_PENDING')
    when 'QUARANTINED' then new.state in ('DELETION_PENDING')
    when 'FAILED' then new.state in ('DELETION_PENDING')
    when 'DELETION_PENDING' then new.state in ('DELETED')
    else false
  end;
  if not allowed then
    raise exception 'illegal document transition % -> %', old.state, new.state using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger documents_transition_guard
  before update of state on documents
  for each row execute function enforce_document_transition();
