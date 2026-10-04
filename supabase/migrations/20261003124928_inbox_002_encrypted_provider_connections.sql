create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  encrypted_key text not null,
  encrypted_payload text not null,
  iv text not null,
  auth_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_connections_provider_check check (provider in ('line')),
  constraint provider_connections_org_provider_key unique (organization_id, provider)
);

create index provider_connections_organization_idx
  on public.provider_connections (organization_id);

alter table public.provider_connections enable row level security;

revoke all on table public.provider_connections from anon, authenticated;
grant select, insert, update, delete on table public.provider_connections to service_role;
