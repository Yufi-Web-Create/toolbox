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

-- Message ingestion and SMTP replies will be enabled after dedicated integration tests.
