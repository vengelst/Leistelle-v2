create table monitoring_service_cases (
  id text primary key,
  disturbance_id text not null unique references monitoring_disturbances(id) on delete cascade,
  site_id text not null references sites(id) on delete restrict,
  device_id text references devices(id) on delete set null,
  reference_label text,
  status text not null check (status in ('open', 'accepted', 'resolved')),
  comment text not null,
  created_at timestamptz not null default now(),
  created_by_user_id text not null references users(id) on delete restrict
);

create index monitoring_service_cases_status_created_idx
  on monitoring_service_cases(status, created_at desc);

create index monitoring_service_cases_site_idx
  on monitoring_service_cases(site_id, created_at desc);
