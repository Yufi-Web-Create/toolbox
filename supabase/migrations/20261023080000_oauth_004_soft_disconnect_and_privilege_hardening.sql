create or replace function public.omnibox_delete_provider_connection(
  p_connection_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_connection public.provider_connections%rowtype;
begin
  select pc.*
    into v_connection
  from public.provider_connections pc
  where pc.id = p_connection_id
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = pc.organization_id
        and om.user_id = v_user_id
        and om.role = 'owner'
    )
  limit 1;

  if v_connection.id is null then
    return false;
  end if;

  if v_connection.vault_secret_id is not null then
    delete from vault.secrets
    where id = v_connection.vault_secret_id;
  end if;

  update public.provider_connections
  set status = 'revoked',
      vault_secret_id = null,
      token_expires_at = null,
      scopes = '{}',
      updated_at = now()
  where id = v_connection.id;

  return true;
end;
$$;

create or replace function public.omnibox_list_provider_connections()
returns table (
  id uuid,
  provider text,
  external_account_id text,
  account_name text,
  handle text,
  status text,
  scopes text[],
  token_expires_at timestamptz,
  created_at timestamptz,
  metadata jsonb
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    pc.id,
    pc.provider,
    pc.external_account_id,
    coalesce(
      pc.account_name,
      case pc.provider
        when 'line' then 'LINE公式アカウント'
        when 'instagram' then 'Instagram'
        when 'x' then 'X'
        when 'google' then 'Google / Gmail'
        else pc.provider
      end
    ) as account_name,
    coalesce(
      pc.handle,
      case pc.provider when 'line' then 'Messaging API' else '' end
    ) as handle,
    pc.status,
    pc.scopes,
    pc.token_expires_at,
    pc.created_at,
    pc.metadata
  from public.provider_connections pc
  where pc.status <> 'revoked'
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = pc.organization_id
        and om.user_id = auth.uid()
    )
  order by pc.created_at asc;
$$;

revoke execute on function public.omnibox_rename_provider_connection(uuid, text) from anon;
revoke execute on function public.omnibox_update_organization_plan(uuid, text) from anon;
revoke execute on function public.omnibox_delete_provider_connection(uuid) from anon;

grant execute on function public.omnibox_delete_provider_connection(uuid) to authenticated;
grant execute on function public.omnibox_list_provider_connections() to authenticated;
