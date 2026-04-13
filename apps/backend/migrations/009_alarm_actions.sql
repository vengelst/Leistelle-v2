create table if not exists alarm_case_actions (
  id text primary key,
  alarm_case_id text not null references alarm_cases(id) on delete cascade,
  action_type_id text not null references alarm_action_types(id) on delete restrict,
  status_id text not null references alarm_action_statuses(id) on delete restrict,
  user_id text not null references users(id) on delete restrict,
  comment text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alarm_case_actions_case_time_idx
  on alarm_case_actions(alarm_case_id, occurred_at asc, created_at asc);

create index if not exists alarm_case_actions_user_idx
  on alarm_case_actions(user_id, occurred_at desc);
