create table if not exists monitoring_disturbance_types (
  id text primary key,
  code text not null unique,
  label text not null,
  description text,
  default_priority text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_disturbance_types_code_check
    check (code in (
      'router_unreachable',
      'nvr_unreachable',
      'camera_unreachable',
      'site_connection_disturbed',
      'technical_alarm',
      'other_disturbance'
    )),
  constraint monitoring_disturbance_types_default_priority_check
    check (default_priority in ('normal', 'high', 'critical'))
);

alter table sites
  add column if not exists technical_status text not null default 'ok';

alter table sites
  add column if not exists technical_status_updated_at timestamptz not null default now();

alter table sites
  drop constraint if exists sites_technical_status_check;

alter table sites
  add constraint sites_technical_status_check
  check (technical_status in ('ok', 'disturbed', 'offline'));

create table if not exists monitoring_disturbances (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  device_id text references devices(id) on delete set null,
  reference_label text,
  disturbance_type_id text not null references monitoring_disturbance_types(id),
  priority text not null,
  priority_rank integer not null,
  status text not null default 'open',
  title text not null,
  description text,
  comment text,
  owner_user_id text references users(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_disturbances_priority_check
    check (priority in ('normal', 'high', 'critical')),
  constraint monitoring_disturbances_status_check
    check (status in ('open', 'acknowledged', 'resolved')),
  constraint monitoring_disturbances_time_check
    check (ended_at is null or ended_at >= started_at)
);

create index if not exists sites_technical_status_idx
  on sites(technical_status, technical_status_updated_at desc);

create index if not exists monitoring_disturbances_open_idx
  on monitoring_disturbances(status, priority_rank desc, started_at desc)
  where status in ('open', 'acknowledged');

create index if not exists monitoring_disturbances_site_history_idx
  on monitoring_disturbances(site_id, started_at desc, created_at desc);

create index if not exists monitoring_disturbances_device_history_idx
  on monitoring_disturbances(device_id, started_at desc, created_at desc)
  where device_id is not null;

create index if not exists monitoring_disturbances_type_status_idx
  on monitoring_disturbances(disturbance_type_id, status, started_at desc);
