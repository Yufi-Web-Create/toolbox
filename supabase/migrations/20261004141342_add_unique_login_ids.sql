create table if not exists public.login_ids (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_id text not null unique,
  created_at timestamptz not null default now(),
  constraint login_ids_format_check
    check (
      login_id = lower(login_id)
      and login_id ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
    )
);

alter table public.login_ids enable row level security;

revoke all on table public.login_ids from anon, authenticated;
grant all on table public.login_ids to service_role;
