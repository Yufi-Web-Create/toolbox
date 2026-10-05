create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_organization_idx
  on public.push_subscriptions (organization_id);

alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on table public.push_subscriptions to authenticated;

create policy "push subscriptions select own"
on public.push_subscriptions
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.organization_members m
    where m.organization_id = push_subscriptions.organization_id
      and m.user_id = (select auth.uid())
  )
);

create policy "push subscriptions insert own"
on public.push_subscriptions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.organization_members m
    where m.organization_id = push_subscriptions.organization_id
      and m.user_id = (select auth.uid())
  )
);

create policy "push subscriptions update own"
on public.push_subscriptions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.organization_members m
    where m.organization_id = push_subscriptions.organization_id
      and m.user_id = (select auth.uid())
  )
);

create policy "push subscriptions delete own"
on public.push_subscriptions
for delete
to authenticated
using (user_id = (select auth.uid()));
