alter table alarm_source_mappings
  add column if not exists media_bundle_profile_key text null;

create table if not exists alarm_media_inbox (
  id text primary key,
  vendor text not null,
  source_type text not null,
  parser_key text null,
  media_bundle_profile_key text null,
  storage_key text not null unique,
  original_filename text null,
  relative_path text null,
  mime_type text null,
  media_kind text not null,
  sequence_no integer null,
  source_id text null,
  channel_id text null,
  event_type text null,
  event_ts timestamptz null,
  vendor_event_id text null,
  correlation_key text null,
  site_id text null references sites(id) on delete set null,
  component_id text null references devices(id) on delete set null,
  nvr_component_id text null references devices(id) on delete set null,
  alarm_case_id text null references alarm_cases(id) on delete set null,
  attached_media_id text null references alarm_media(id) on delete set null,
  status text not null,
  parse_error text null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alarm_media_inbox_media_kind_check check (media_kind in ('snapshot', 'clip', 'audio', 'thermal', 'document', 'other')),
  constraint alarm_media_inbox_status_check check (status in ('pending', 'attached', 'duplicate', 'orphaned', 'error')),
  constraint alarm_media_inbox_sequence_positive check (sequence_no is null or sequence_no > 0)
);

create index if not exists idx_alarm_media_inbox_correlation_key
  on alarm_media_inbox(correlation_key)
  where correlation_key is not null;

create index if not exists idx_alarm_media_inbox_vendor_event_id
  on alarm_media_inbox(vendor, source_type, vendor_event_id)
  where vendor_event_id is not null;

create index if not exists idx_alarm_media_inbox_component_event
  on alarm_media_inbox(site_id, component_id, event_type, event_ts)
  where event_ts is not null;

create index if not exists idx_alarm_media_inbox_status
  on alarm_media_inbox(status, created_at desc);
