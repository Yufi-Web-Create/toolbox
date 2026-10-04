create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  content text not null,
  media_url text,
  target_connection_ids uuid[] not null default '{}',
  scheduled_at timestamptz,
  status text not null default 'scheduled',
  results jsonb not null default '[]'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint social_posts_content_not_blank check (btrim(content) <> ''),
  constraint social_posts_targets_not_empty check (cardinality(target_connection_ids) > 0),
  constraint social_posts_status_check check (
    status in ('scheduled','publishing','published','partial_failed','failed','cancelled')
  )
);

create index if not exists social_posts_org_scheduled_idx
  on public.social_posts(organization_id, scheduled_at desc);

create index if not exists social_posts_due_idx
  on public.social_posts(status, scheduled_at)
  where status = 'scheduled';

alter table public.social_posts enable row level security;

create policy "Organization members can read social posts"
on public.social_posts for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = social_posts.organization_id
      and om.user_id = auth.uid()
  )
);

create policy "Organization members can create social posts"
on public.social_posts for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.organization_members om
    where om.organization_id = social_posts.organization_id
      and om.user_id = auth.uid()
  )
);

create policy "Organization members can cancel social posts"
on public.social_posts for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = social_posts.organization_id
      and om.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = social_posts.organization_id
      and om.user_id = auth.uid()
  )
);

grant select, insert, update(status, updated_at) on public.social_posts to authenticated;
