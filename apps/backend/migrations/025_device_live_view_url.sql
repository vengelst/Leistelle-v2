alter table devices
  add column if not exists live_view_url text null;

create index if not exists idx_devices_live_view_url on devices(live_view_url) where live_view_url is not null;
