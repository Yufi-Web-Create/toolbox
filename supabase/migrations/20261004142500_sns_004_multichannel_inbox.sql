alter table public.conversations
  drop constraint if exists conversations_provider_check;

alter table public.conversations
  add constraint conversations_provider_check
  check (provider in ('line','instagram','x','email'));

alter table public.conversations
  add column if not exists provider_connection_id uuid
    references public.provider_connections(id) on delete set null;

alter table public.messages
  add column if not exists provider_connection_id uuid
    references public.provider_connections(id) on delete set null;

alter table public.conversations
  drop constraint if exists conversations_org_provider_thread_key;

create unique index if not exists conversations_org_provider_account_thread_key
  on public.conversations (
    organization_id,
    provider,
    coalesce(provider_connection_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider_thread_id
  );

create index if not exists conversations_provider_connection_idx
  on public.conversations(provider_connection_id);

create index if not exists messages_provider_connection_idx
  on public.messages(provider_connection_id);

create or replace function public.omnibox_ingest_external_message(
  p_provider_connection_id uuid,
  p_provider text,
  p_provider_thread_id text,
  p_customer_external_id text,
  p_customer_display_name text,
  p_customer_avatar_url text,
  p_provider_message_id text,
  p_body text,
  p_occurred_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_conversation_id uuid;
  v_name_source text;
begin
  if p_provider not in ('instagram','x','email') then
    raise exception 'unsupported provider';
  end if;

  select organization_id
    into v_org_id
  from public.provider_connections
  where id = p_provider_connection_id
    and provider = case
      when p_provider = 'email' then 'google'
      else p_provider
    end
    and status = 'active'
  limit 1;

  if v_org_id is null then
    raise exception 'provider connection not found';
  end if;

  select id, customer_name_source
    into v_conversation_id, v_name_source
  from public.conversations
  where organization_id = v_org_id
    and provider = p_provider
    and coalesce(provider_connection_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_provider_connection_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and provider_thread_id = p_provider_thread_id
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (
      organization_id,
      provider,
      provider_connection_id,
      provider_thread_id,
      customer_external_id,
      customer_display_name,
      customer_avatar_url,
      customer_name_source,
      status,
      last_message_preview,
      last_message_at
    )
    values (
      v_org_id,
      p_provider,
      p_provider_connection_id,
      p_provider_thread_id,
      p_customer_external_id,
      coalesce(nullif(btrim(p_customer_display_name), ''), p_customer_external_id),
      nullif(btrim(p_customer_avatar_url), ''),
      'provider',
      'unread',
      left(p_body, 500),
      p_occurred_at
    )
    returning id into v_conversation_id;
  else
    update public.conversations
    set customer_external_id = coalesce(nullif(btrim(p_customer_external_id), ''), customer_external_id),
        customer_display_name = case
          when customer_name_source = 'custom' then customer_display_name
          else coalesce(nullif(btrim(p_customer_display_name), ''), customer_display_name)
        end,
        customer_avatar_url = coalesce(nullif(btrim(p_customer_avatar_url), ''), customer_avatar_url),
        status = 'unread',
        last_message_preview = left(p_body, 500),
        last_message_at = p_occurred_at,
        updated_at = now()
    where id = v_conversation_id;
  end if;

  insert into public.messages (
    organization_id,
    conversation_id,
    provider_connection_id,
    provider_message_id,
    direction,
    body,
    sent_by_user_id,
    created_at
  )
  values (
    v_org_id,
    v_conversation_id,
    p_provider_connection_id,
    p_provider_message_id,
    'inbound',
    p_body,
    null,
    p_occurred_at
  )
  on conflict (organization_id, provider_message_id) do nothing;

  return v_conversation_id;
end;
$$;

revoke all on function public.omnibox_ingest_external_message(uuid,text,text,text,text,text,text,text,timestamptz,jsonb) from public;
revoke execute on function public.omnibox_ingest_external_message(uuid,text,text,text,text,text,text,text,timestamptz,jsonb) from anon;
revoke execute on function public.omnibox_ingest_external_message(uuid,text,text,text,text,text,text,text,timestamptz,jsonb) from authenticated;
grant execute on function public.omnibox_ingest_external_message(uuid,text,text,text,text,text,text,text,timestamptz,jsonb) to service_role;
