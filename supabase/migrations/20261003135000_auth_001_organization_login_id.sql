
alter table public.organizations
  add column login_id text;

alter table public.organizations
  add constraint organizations_login_id_format
  check (
    login_id is null
    or login_id ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
  );

create unique index organizations_login_id_lower_key
  on public.organizations (lower(login_id))
  where login_id is not null;

grant update (name, login_id) on public.organizations to authenticated;
