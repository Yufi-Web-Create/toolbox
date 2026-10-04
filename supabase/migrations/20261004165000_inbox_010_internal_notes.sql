create table if not exists public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint internal_notes_body_not_blank check (btrim(body) <> '')
);

create index if not exists internal_notes_conversation_created_idx
  on public.internal_notes(organization_id, conversation_id, created_at);

alter table public.internal_notes enable row level security;

create policy "Organization members can read internal notes"
on public.internal_notes for select to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = internal_notes.organization_id
      and om.user_id = auth.uid()
  )
);

create policy "Organization members can create internal notes"
on public.internal_notes for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.organization_members om
    where om.organization_id = internal_notes.organization_id
      and om.user_id = auth.uid()
  )
);

grant select, insert on public.internal_notes to authenticated;
