create table if not exists customers (
  id text primary key,
  name text not null unique,
  external_ref text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists global_settings (
  id smallint primary key,
  monitoring_interval_seconds integer not null,
  failure_threshold integer not null,
  ui_density text not null,
  escalation_profile text not null,
  workflow_profile text not null,
  updated_at timestamptz not null default now(),
  constraint global_settings_singleton check (id = 1)
);

create table if not exists sites (
  id text primary key,
  customer_id text not null references customers(id) on delete restrict,
  site_name text not null,
  status text not null,
  street text not null,
  postal_code text not null,
  city text not null,
  country text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists site_settings (
  site_id text primary key references sites(id) on delete cascade,
  monitoring_interval_seconds integer not null,
  failure_threshold integer not null,
  highlight_critical_devices boolean not null,
  default_alarm_priority text not null,
  default_workflow_profile text not null,
  map_label_mode text not null
);

create table if not exists devices (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  name text not null,
  type text not null,
  vendor text null,
  model text null,
  serial_number text null,
  status text not null,
  network_address text null,
  created_at timestamptz not null default now()
);

create table if not exists technical_credentials (
  id text primary key,
  scope text not null,
  site_id text null references sites(id) on delete cascade,
  device_id text null references devices(id) on delete cascade,
  label text not null,
  username text not null,
  password_secret text not null,
  notes text null,
  created_at timestamptz not null default now(),
  constraint technical_credentials_scope_check check (
    (scope = 'site' and site_id is not null and device_id is null)
    or
    (scope = 'device' and device_id is not null and site_id is null)
  )
);

create table if not exists technical_credential_role_visibility (
  credential_id text not null references technical_credentials(id) on delete cascade,
  role_key text not null references roles(role_key) on delete cascade,
  primary key (credential_id, role_key)
);

create table if not exists site_plans (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  name text not null,
  kind text not null,
  asset_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists plan_markers (
  id text primary key,
  plan_id text not null references site_plans(id) on delete cascade,
  label text not null,
  x numeric(10, 2) not null,
  y numeric(10, 2) not null,
  device_id text null references devices(id) on delete set null,
  marker_type text not null
);

create index if not exists idx_sites_customer_id on sites(customer_id);
create index if not exists idx_devices_site_id on devices(site_id);
create index if not exists idx_site_plans_site_id on site_plans(site_id);
create index if not exists idx_plan_markers_plan_id on plan_markers(plan_id);
