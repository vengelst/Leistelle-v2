create table if not exists alarm_action_types (
  id text primary key,
  code text not null unique,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  constraint alarm_action_types_code_check check (code in (
    'call_police',
    'call_security_service',
    'call_customer',
    'speaker_live_announcement',
    'speaker_pre_recorded_announcement'
  ))
);

create table if not exists alarm_action_statuses (
  id text primary key,
  code text not null unique,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  constraint alarm_action_statuses_code_check check (code in (
    'pending',
    'in_progress',
    'completed',
    'failed',
    'not_reachable',
    'not_required'
  ))
);

create table if not exists alarm_workflow_profiles (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  code text not null unique,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  active_from_time time,
  active_to_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists alarm_workflow_profile_steps (
  id text primary key,
  profile_id text not null references alarm_workflow_profiles(id) on delete cascade,
  step_code text not null,
  title text not null,
  instruction text,
  sort_order integer not null default 0,
  is_required_by_default boolean not null default false,
  action_type_id text references alarm_action_types(id) on delete set null,
  active_from_time time,
  active_to_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, step_code)
);

create index if not exists alarm_action_types_active_idx
  on alarm_action_types(is_active, sort_order asc);

create index if not exists alarm_action_statuses_active_idx
  on alarm_action_statuses(is_active, sort_order asc);

create index if not exists alarm_workflow_profiles_site_idx
  on alarm_workflow_profiles(site_id, is_active, sort_order asc);

create index if not exists alarm_workflow_profile_steps_profile_idx
  on alarm_workflow_profile_steps(profile_id, sort_order asc);
