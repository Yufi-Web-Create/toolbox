create or replace function public.omnibox_get_provider_secret(
  p_connection_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  select vault_secret_id
    into v_secret_id
  from public.provider_connections
  where id = p_connection_id
  limit 1;

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where id = v_secret_id
  limit 1;

  return v_secret;
end;
$$;

create or replace function public.omnibox_replace_provider_secret(
  p_connection_id uuid,
  p_secret_json text,
  p_token_expires_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id
    into v_secret_id
  from public.provider_connections
  where id = p_connection_id
  limit 1;

  if v_secret_id is null then
    return false;
  end if;

  perform vault.update_secret(
    v_secret_id,
    p_secret_json,
    null,
    'OmniBox OAuth token bundle',
    null
  );

  update public.provider_connections
  set token_expires_at = p_token_expires_at,
      status = 'active',
      updated_at = now()
  where id = p_connection_id;

  return found;
end;
$$;

revoke all on function public.omnibox_get_provider_secret(uuid) from public;
revoke all on function public.omnibox_replace_provider_secret(uuid,text,timestamptz) from public;

revoke execute on function public.omnibox_get_provider_secret(uuid) from anon;
revoke execute on function public.omnibox_get_provider_secret(uuid) from authenticated;
revoke execute on function public.omnibox_replace_provider_secret(uuid,text,timestamptz) from anon;
revoke execute on function public.omnibox_replace_provider_secret(uuid,text,timestamptz) from authenticated;

grant execute on function public.omnibox_get_provider_secret(uuid) to service_role;
grant execute on function public.omnibox_replace_provider_secret(uuid,text,timestamptz) to service_role;
