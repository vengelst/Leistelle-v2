create table if not exists alarm_false_positive_reasons (
  id text primary key,
  code text not null unique,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists alarm_closure_reasons (
  id text primary key,
  code text not null unique,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists alarm_case_false_positive_reasons (
  alarm_case_id text not null references alarm_cases(id) on delete cascade,
  reason_id text not null references alarm_false_positive_reasons(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (alarm_case_id, reason_id)
);

create table if not exists alarm_case_comments (
  id text primary key,
  alarm_case_id text not null references alarm_cases(id) on delete cascade,
  user_id text not null references users(id) on delete restrict,
  comment_kind text not null check (comment_kind in ('operator_note', 'closure_note', 'technical_note')),
  body text not null,
  context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table alarm_cases add column if not exists closure_reason_id text references alarm_closure_reasons(id) on delete restrict;
alter table alarm_cases add column if not exists closed_by_user_id text references users(id) on delete set null;
alter table alarm_cases add column if not exists closure_comment text;
alter table alarm_cases add column if not exists archived_at timestamptz;
alter table alarm_cases add column if not exists archived_by_user_id text references users(id) on delete set null;

create index if not exists alarm_case_comments_case_time_idx
  on alarm_case_comments(alarm_case_id, created_at asc);

create index if not exists alarm_case_false_positive_reasons_case_idx
  on alarm_case_false_positive_reasons(alarm_case_id);

create index if not exists alarm_cases_archived_idx
  on alarm_cases(lifecycle_status, archived_at desc)
  where lifecycle_status = 'archived';
