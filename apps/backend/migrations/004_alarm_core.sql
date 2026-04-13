create table if not exists alarm_cases (
  id text primary key,
  site_id text not null references sites(id) on delete restrict,
  primary_device_id text references devices(id) on delete set null,
  external_source_ref text,
  alarm_type text not null check (alarm_type in ('intrusion', 'tamper', 'video_loss', 'offline', 'audio_detection', 'manual', 'unknown')),
  priority text not null check (priority in ('low', 'normal', 'high', 'critical')),
  priority_rank smallint not null check (priority_rank between 1 and 4),
  lifecycle_status text not null check (lifecycle_status in ('received', 'triaged', 'assigned', 'resolved', 'closed', 'cancelled')),
  assessment_status text not null check (assessment_status in ('pending', 'confirmed_incident', 'false_positive', 'technical_issue', 'duplicate')),
  technical_state text not null check (technical_state in ('complete', 'incomplete', 'invalid_payload', 'source_unreachable', 'media_pending')),
  incomplete_reason text,
  title text not null,
  description text,
  source_occurred_at timestamptz,
  received_at timestamptz not null default now(),
  first_opened_at timestamptz,
  resolved_at timestamptz,
  last_event_at timestamptz not null default now(),
  source_payload jsonb,
  technical_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists alarm_events (
  id text primary key,
  alarm_case_id text not null references alarm_cases(id) on delete cascade,
  event_kind text not null check (event_kind in ('case_created', 'payload_updated', 'status_changed', 'assessment_changed', 'technical_state_changed', 'media_attached', 'assignment_changed')),
  actor_user_id text references users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists alarm_media (
  id text primary key,
  alarm_case_id text not null references alarm_cases(id) on delete cascade,
  device_id text references devices(id) on delete set null,
  media_kind text not null check (media_kind in ('snapshot', 'clip', 'audio', 'thermal', 'document', 'other')),
  storage_key text not null,
  mime_type text,
  captured_at timestamptz,
  is_primary boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists alarm_assignments (
  id text primary key,
  alarm_case_id text not null references alarm_cases(id) on delete cascade,
  user_id text not null references users(id) on delete restrict,
  assignment_kind text not null check (assignment_kind in ('owner', 'support', 'observer', 'reservation')),
  assignment_status text not null check (assignment_status in ('active', 'released', 'completed', 'declined')),
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists alarm_media_primary_per_case_idx
  on alarm_media(alarm_case_id)
  where is_primary = true;

create unique index if not exists alarm_assignment_active_owner_idx
  on alarm_assignments(alarm_case_id, assignment_kind)
  where assignment_kind = 'owner' and assignment_status = 'active';

create index if not exists alarm_cases_open_idx
  on alarm_cases(lifecycle_status, received_at desc)
  where lifecycle_status in ('received', 'triaged', 'assigned');

create index if not exists alarm_cases_priority_time_idx
  on alarm_cases(priority_rank desc, received_at desc, last_event_at desc);

create index if not exists alarm_cases_site_device_idx
  on alarm_cases(site_id, primary_device_id, received_at desc);

create index if not exists alarm_events_case_time_idx
  on alarm_events(alarm_case_id, occurred_at asc);

create index if not exists alarm_media_case_time_idx
  on alarm_media(alarm_case_id, created_at asc);

create index if not exists alarm_assignments_case_status_idx
  on alarm_assignments(alarm_case_id, assignment_status, assigned_at desc);
