alter table users
  add column if not exists kiosk_code_hash text null,
  add column if not exists avatar_data_url text null;

alter table global_settings
  add column if not exists password_min_length integer not null default 8,
  add column if not exists kiosk_code_length integer not null default 6;

update global_settings
set
  password_min_length = coalesce(password_min_length, 8),
  kiosk_code_length = coalesce(kiosk_code_length, 6);
