create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  provider_thread_id text not null,
  customer_external_id text not null,
  customer_display_name text not null default 'LINE user',
  status text not null default 'unread',
  last_message_preview text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_provider_check check (provider in ('line')),
  constraint conversations_status_check check (status in ('unread', 'in_progress', 'completed')),
  constraint conversations_org_provider_thread_key unique (organization_id, provider, provider_thread_id),
  constraint conversations_id_org_key unique (id, organization_id)
);

create index conversations_organization_last_message_idx
  on public.conversations (organization_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  provider_message_id text,
  direction text not null,
  body text not null,
  sent_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint messages_direction_check check (direction in ('inbound', 'outbound')),
  constraint messages_body_not_blank check (btrim(body) <> ''),
  constraint messages_conversation_organization_fkey
    foreign key (conversation_id, organization_id)
    references public.conversations (id, organization_id)
    on delete cascade,
  constraint messages_organization_provider_message_key
    unique (organization_id, provider_message_id)
);

create index messages_conversation_created_at_idx
  on public.messages (organization_id, conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Organization members can read conversations"
  on public.conversations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members
      where organization_members.organization_id = conversations.organization_id
        and organization_members.user_id = (select auth.uid())
    )
  );

create policy "Organization members can read messages"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members
      where organization_members.organization_id = messages.organization_id
        and organization_members.user_id = (select auth.uid())
    )
  );

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;

grant select on table public.conversations to authenticated;
grant select on table public.messages to authenticated;

grant select, insert, update on table public.conversations to service_role;
grant select, insert, update on table public.messages to service_role;
