-- Independent email accounts live alongside Google OAuth, but share the
-- existing organization-scoped inbox ('email') message channel.
-- Credential JSON is stored only in Supabase Vault.
create or replace function public.omnibox_store_imap_connection(
  p_email text,
  p_display_name text,
  p_secret_json text
) returns uuid
language plpgsql security definer
set search_path to 'public','vault','extensions','pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_id uuid;
  v_secret_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select organization_id, role into v_org,v_role
    from public.organization_members
   where user_id = v_user_id limit 1;
  if v_org is null or v_role <> 'owner' then raise exception 'owner required'; end if;
  if p_email is null or length(p_email) > 254 or
     p_email !~* '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' or
     coalesce(length(p_secret_json),0) < 10 or length(p_secret_json) > 10000 or
     nullif(trim(p_display_name),'') is null or length(p_display_name)>120
  then raise exception 'invalid mail connection'; end if;

  select id, vault_secret_id into v_id,v_secret_id
    from public.provider_connections
   where organization_id=v_org and provider='imap'
     and lower(external_account_id)=lower(p_email)
   limit 1 for update;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret_json,
      'matomeet-imap-'||gen_random_uuid()::text,
      'MatoMeet user-configured IMAP and SMTP credentials',
      null
    );
  else
    perform vault.update_secret(v_secret_id,p_secret_json,null,
      'MatoMeet user-configured IMAP and SMTP credentials',null);
  end if;
  if v_id is null then
    insert into public.provider_connections
     (organization_id,provider,external_account_id,account_name,handle,status,
      vault_secret_id,connected_by,metadata)
    values(v_org,'imap',lower(p_email),trim(p_display_name),lower(p_email),
      'active',v_secret_id,v_user_id,'{"connection_type":"imap_smtp"}'::jsonb)
    returning id into v_id;
  else
    update public.provider_connections
       set account_name=trim(p_display_name),handle=lower(p_email),status='active',
           vault_secret_id=v_secret_id,updated_at=now(),connected_by=v_user_id,
           metadata='{"connection_type":"imap_smtp"}'::jsonb
     where id=v_id;
  end if;
  return v_id;
end $$;

revoke all on function public.omnibox_store_imap_connection(text,text,text) from public,anon;
grant execute on function public.omnibox_store_imap_connection(text,text,text) to authenticated;

-- General email messages may originate from either Google OAuth or IMAP.
-- Preserve all existing fields, including conversation ID and duplicate controls.
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
) returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_org_id uuid; v_conversation_id uuid; v_was_inserted boolean;
begin
  if p_provider not in ('instagram','x','email') then raise exception 'unsupported provider'; end if;
  select organization_id into v_org_id
    from public.provider_connections
   where id=p_provider_connection_id
     and (provider=case when p_provider='email' then 'google' else p_provider end
          or (p_provider='email' and provider='imap'))
     and status='active' limit 1;
  if v_org_id is null then raise exception 'provider connection not found'; end if;
  select id into v_conversation_id from public.conversations
   where organization_id=v_org_id and provider=p_provider
     and provider_connection_id=p_provider_connection_id
     and provider_thread_id=p_provider_thread_id limit 1;
  if v_conversation_id is null then
    insert into public.conversations
     (organization_id,provider,provider_connection_id,provider_thread_id,
      customer_external_id,customer_display_name,customer_avatar_url,
      customer_name_source,status,last_message_preview,last_message_at,provider_metadata)
    values(v_org_id,p_provider,p_provider_connection_id,p_provider_thread_id,
      p_customer_external_id,coalesce(nullif(trim(p_customer_display_name),''),p_customer_external_id),
      nullif(trim(p_customer_avatar_url),''),'provider','unread',left(p_body,500),
      p_occurred_at,coalesce(p_metadata,'{}'::jsonb))
    returning id into v_conversation_id;
  end if;
  insert into public.messages
   (organization_id,conversation_id,provider_connection_id,provider_message_id,direction,body,sent_by_user_id,created_at)
  values(v_org_id,v_conversation_id,p_provider_connection_id,p_provider_message_id,'inbound',p_body,null,p_occurred_at)
  on conflict (organization_id,provider_message_id) do nothing
  returning true into v_was_inserted;
  -- Unlike the old RPC, duplicates do not reset completed conversations.
  if coalesce(v_was_inserted,false) then
    update public.conversations set
      customer_external_id=coalesce(nullif(trim(p_customer_external_id),''),customer_external_id),
      customer_display_name=case when customer_name_source='custom' then customer_display_name
        else coalesce(nullif(trim(p_customer_display_name),''),customer_display_name) end,
      customer_avatar_url=coalesce(nullif(trim(p_customer_avatar_url),''),customer_avatar_url),
      status='unread',last_message_preview=left(p_body,500),last_message_at=p_occurred_at,
      provider_metadata=coalesce(provider_metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),
      updated_at=now() where id=v_conversation_id;
  end if;
  return v_conversation_id;
end $$;
