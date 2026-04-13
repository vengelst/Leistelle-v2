create table if not exists audit_events (
  id text primary key,
  request_id text not null,
  category text not null,
  action text not null,
  outcome text not null,
  actor_user_id text null references users(id) on delete set null,
  subject_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_request_id on audit_events(request_id);
create index if not exists idx_audit_events_created_at on audit_events(created_at desc);
