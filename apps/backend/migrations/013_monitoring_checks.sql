create table if not exists monitoring_check_targets (
  id text primary key,
  scope text not null,
  site_id text not null references sites(id) on delete cascade,
  device_id text references devices(id) on delete cascade,
  label text not null,
  check_kind text not null,
  endpoint text not null,
  port integer,
  path text,
  request_method text,
  expected_status_codes integer[] not null default array[200]::integer[],
  timeout_ms integer not null default 3000,
  requires_vpn boolean not null default false,
  disturbance_type_id text not null references monitoring_disturbance_types(id),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_check_targets_scope_check
    check (scope in ('site', 'device')),
  constraint monitoring_check_targets_check_kind_check
    check (check_kind in ('vpn', 'ping', 'http', 'api', 'onvif')),
  constraint monitoring_check_targets_request_method_check
    check (request_method is null or request_method in ('GET', 'HEAD')),
  constraint monitoring_check_targets_timeout_check
    check (timeout_ms > 0),
  constraint monitoring_check_targets_port_check
    check (port is null or (port >= 1 and port <= 65535)),
  constraint monitoring_check_targets_device_scope_check
    check (
      (scope = 'site' and device_id is null)
      or (scope = 'device' and device_id is not null)
    )
);

alter table monitoring_disturbances
  add column if not exists check_target_id text references monitoring_check_targets(id) on delete set null;

create table if not exists monitoring_check_states (
  target_id text primary key references monitoring_check_targets(id) on delete cascade,
  last_status text,
  consecutive_failures integer not null default 0,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  active_disturbance_id text references monitoring_disturbances(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_check_states_last_status_check
    check (last_status is null or last_status in ('ok', 'failed', 'skipped')),
  constraint monitoring_check_states_consecutive_failures_check
    check (consecutive_failures >= 0)
);

create index if not exists monitoring_check_targets_active_idx
  on monitoring_check_targets(site_id, is_active, sort_order asc, check_kind);

create index if not exists monitoring_check_targets_device_idx
  on monitoring_check_targets(device_id, is_active)
  where device_id is not null;

create unique index if not exists monitoring_disturbances_active_target_idx
  on monitoring_disturbances(check_target_id)
  where check_target_id is not null and status in ('open', 'acknowledged');
