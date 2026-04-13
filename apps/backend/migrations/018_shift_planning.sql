create table if not exists shift_plans (
  id text primary key,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  handover_note text null,
  handover_noted_at timestamptz null,
  handover_noted_by_user_id text null references users(id) on delete set null,
  created_by_user_id text not null references users(id) on delete restrict,
  updated_by_user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_plans_time_range check (starts_at < ends_at)
);

create index if not exists idx_shift_plans_starts_at on shift_plans(starts_at);
create index if not exists idx_shift_plans_ends_at on shift_plans(ends_at);

create table if not exists shift_plan_assignments (
  id text primary key,
  shift_id text not null references shift_plans(id) on delete cascade,
  user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (shift_id, user_id)
);

create index if not exists idx_shift_plan_assignments_user_id on shift_plan_assignments(user_id);
