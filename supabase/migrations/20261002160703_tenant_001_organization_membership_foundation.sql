create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (btrim(name) <> ''),
  constraint organizations_id_created_by_key unique (id, created_by)
);

create index organizations_created_by_idx
  on public.organizations (created_by);

create table public.organization_members (
  organization_id uuid not null,
  organization_created_by uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  constraint organization_members_pkey primary key (organization_id, user_id),
  constraint organization_members_role_check check (role in ('owner', 'member')),
  constraint organization_members_organization_creator_fkey
    foreign key (organization_id, organization_created_by)
    references public.organizations (id, created_by)
    on delete cascade
);

create index organization_members_user_id_idx
  on public.organization_members (user_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create policy "Authenticated users can create their organizations"
  on public.organizations
  for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

create policy "Users can read organizations they created or joined"
  on public.organizations
  for select
  to authenticated
  using (
    (select auth.uid()) = created_by
    or exists (
      select 1
      from public.organization_members
      where organization_members.organization_id = organizations.id
        and organization_members.user_id = (select auth.uid())
    )
  );

create policy "Users can read their own organization memberships"
  on public.organization_members
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Organization creators can add their initial owner membership"
  on public.organization_members
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and role = 'owner'
    and (select auth.uid()) = organization_created_by
  );

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;

grant select, insert on table public.organizations to authenticated;
grant select, insert on table public.organization_members to authenticated;
