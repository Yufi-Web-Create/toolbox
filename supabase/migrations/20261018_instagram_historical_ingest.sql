-- Historical DM backfill must never mark already-handled threads as unread.
-- Explicit service-role-only execution; public users cannot forge historical mail.
create or replace function public.omnibox_ingest_instagram_history(
  p_connection_id uuid,
  p_customer_id text,
  p_message_id text,
  p_body text,
  p_occurred_at timestamptz,
  p_direction text,
  p_conversation_id text default null
) returns boolean
language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_org uuid;
  v_thread uuid;
  v_inserted uuid;
begin
  if p_direction not in ('inbound','outbound') or
    nullif(trim(p_customer_id),'') is null or
    nullif(trim(p_message_id),'') is null or
    nullif(trim(p_body),'') is null or
    length(p_body)>10000 or
    p_occurred_at is null then
      raise exception 'invalid Instagram history record';
  end if;
  select organization_id into v_org from public.provider_connections
   where id=p_connection_id and provider='instagram' and status='active';
  if v_org is null then raise exception 'Instagram connection unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_connection_id::text||':'||p_customer_id, 0));
  select id into v_thread from public.conversations
   where organization_id=v_org and provider='instagram'
     and provider_connection_id=p_connection_id
     and provider_thread_id=p_customer_id limit 1;
  if v_thread is null then
    insert into public.conversations
      (organization_id,provider,provider_connection_id,provider_thread_id,
       customer_external_id,customer_display_name,status,last_message_preview,
       last_message_at,provider_metadata)
    values
      (v_org,'instagram',p_connection_id,p_customer_id,p_customer_id,p_customer_id,
       'completed',left(p_body,500),p_occurred_at,
       jsonb_build_object('history_import',true,'instagram_conversation_id',p_conversation_id))
    returning id into v_thread;
  end if;
  insert into public.messages
    (organization_id,conversation_id,provider_connection_id,provider_message_id,
     direction,body,created_at,metadata)
  values
    (v_org,v_thread,p_connection_id,p_message_id,p_direction,p_body,p_occurred_at,
     jsonb_build_object('historical_import',true))
  on conflict (organization_id,provider_message_id) do nothing
  returning id into v_inserted;
  if v_inserted is null then return false; end if;
  update public.conversations set
    last_message_preview=left(p_body,500), last_message_at=p_occurred_at,
    updated_at=now()
    where id=v_thread and last_message_at<p_occurred_at;
  return true;
end $$;
revoke all on function public.omnibox_ingest_instagram_history(uuid,text,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.omnibox_ingest_instagram_history(uuid,text,text,text,timestamptz,text,text) to service_role;
