create table monitoring_disturbance_events (
  id text primary key,
  disturbance_id text not null references monitoring_disturbances(id) on delete cascade,
  event_kind text not null check (event_kind in ('disturbance_opened', 'observation_updated', 'status_changed', 'note_added')),
  previous_status text check (previous_status in ('open', 'acknowledged', 'resolved')),
  status text check (status in ('open', 'acknowledged', 'resolved')),
  actor_user_id text references users(id) on delete set null,
  message text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index monitoring_disturbance_events_disturbance_time_idx
  on monitoring_disturbance_events(disturbance_id, created_at desc);

create index monitoring_disturbance_events_note_idx
  on monitoring_disturbance_events(disturbance_id, event_kind, created_at desc);
