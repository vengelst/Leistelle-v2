create table if not exists alarm_source_mappings (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  component_id text not null references devices(id) on delete cascade,
  nvr_component_id text null references devices(id) on delete set null,
  vendor text not null,
  source_type text not null,
  external_source_key text null,
  external_device_id text null,
  external_recorder_id text null,
  channel_number integer null,
  serial_number text null,
  analytics_name text null,
  event_namespace text null,
  description text null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alarm_source_mappings_channel_number_positive check (channel_number is null or channel_number > 0)
);

create index if not exists idx_alarm_source_mappings_site_id
  on alarm_source_mappings(site_id);

create index if not exists idx_alarm_source_mappings_component_id
  on alarm_source_mappings(component_id);

create index if not exists idx_alarm_source_mappings_vendor_source_type
  on alarm_source_mappings(vendor, source_type)
  where is_active = true;

create index if not exists idx_alarm_source_mappings_external_device_id
  on alarm_source_mappings(external_device_id)
  where external_device_id is not null;

create index if not exists idx_alarm_source_mappings_external_recorder_id
  on alarm_source_mappings(external_recorder_id)
  where external_recorder_id is not null;

create index if not exists idx_alarm_source_mappings_serial_number
  on alarm_source_mappings(serial_number)
  where serial_number is not null;
