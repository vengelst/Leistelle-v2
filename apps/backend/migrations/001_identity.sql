create table if not exists users (
  id text primary key,
  username text not null unique,
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  primary_role text not null,
  current_status text not null,
  current_pause_reason text null,
  last_status_change_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists roles (
  role_key text primary key
);

create table if not exists user_roles (
  user_id text not null references users(id) on delete cascade,
  role_key text not null references roles(role_key) on delete cascade,
  primary key (user_id, role_key)
);

create table if not exists user_sessions (
  token text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists user_status_history (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  status text not null,
  pause_reason text null,
  changed_at timestamptz not null,
  changed_by_user_id text null references users(id) on delete set null
);

create index if not exists idx_user_sessions_user_id on user_sessions(user_id);
create index if not exists idx_user_status_history_user_id on user_status_history(user_id, changed_at desc);
