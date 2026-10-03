alter table public.conversations
  add column customer_avatar_url text,
  add column customer_name_source text not null default 'provider';

alter table public.conversations
  add constraint conversations_customer_name_source_check
  check (customer_name_source in ('provider','custom'));

grant update (customer_display_name, customer_name_source) on public.conversations to authenticated;

create policy "Organization members can update conversation customer names"
on public.conversations
for update
to authenticated
using (
  exists (
    select 1 from public.organization_members
    where organization_members.organization_id = conversations.organization_id
      and organization_members.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.organization_members
    where organization_members.organization_id = conversations.organization_id
      and organization_members.user_id = (select auth.uid())
  )
);

create table public.reply_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  category text not null default 'general',
  body text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint reply_templates_title_not_blank check (btrim(title) <> ''),
  constraint reply_templates_body_not_blank check (btrim(body) <> '')
);

create index reply_templates_organization_idx
  on public.reply_templates(organization_id, created_at);

alter table public.reply_templates enable row level security;

create policy "Organization members can read reply templates"
on public.reply_templates for select to authenticated
using (
  exists (
    select 1 from public.organization_members
    where organization_members.organization_id = reply_templates.organization_id
      and organization_members.user_id = (select auth.uid())
  )
);

create policy "Organization members can create reply templates"
on public.reply_templates for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.organization_members
    where organization_members.organization_id = reply_templates.organization_id
      and organization_members.user_id = (select auth.uid())
  )
);

create policy "Organization members can delete reply templates"
on public.reply_templates for delete to authenticated
using (
  exists (
    select 1 from public.organization_members
    where organization_members.organization_id = reply_templates.organization_id
      and organization_members.user_id = (select auth.uid())
  )
);

grant select, insert, delete on public.reply_templates to authenticated;
