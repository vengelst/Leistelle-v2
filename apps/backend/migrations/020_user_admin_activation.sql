alter table users
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update users
set
  is_active = coalesce(is_active, true),
  updated_at = coalesce(updated_at, created_at, now());
