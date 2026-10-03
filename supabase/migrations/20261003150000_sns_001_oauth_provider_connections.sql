alter table public.provider_connections
  drop constraint if exists provider_connections_provider_check;

alter table public.provider_connections
  add constraint provider_connections_provider_check
  check (provider in ('line', 'instagram', 'x', 'google'));

alter table public.provider_connections
  alter column encrypted_key drop not null,
  alter column encrypted_payload drop not null,
  alter column iv drop not null,
  alter column auth_tag drop not null,
  add column if not exists external_account_id text,
  add column if not exists account_name text,
  add column if not exists handle text,
  add column if not exists status text not null default 'active',
  add column if not exists scopes text[] not null default '{}',
  add column if not exists vault_secret_id uuid,
  add column if not exists token_expires_at timestamptz,
  add column if not exists connected_by uuid references auth.users(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.provider_connections
  drop constraint if exists provider_connections_status_check;

alter table public.provider_connections
  add constraint provider_connections_status_check
  check (status in ('active', 'expired', 'error', 'revoked'));

alter table public.provider_connections
  drop constraint if exists provider_connections_org_provider_key;

create unique index if not exists provider_connections_org_provider_account_key
  on public.provider_connections (
    organization_id,
    provider,
    coalesce(external_account_id, '__default__')
  );

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
  where exists (
    select 1
    from public.organization_members om
    where om.organization_id = pc.organization_id
      and om.user_id = auth.uid()
  )
  order by pc.created_at asc;
$$;

create or replace function public.omnibox_store_oauth_connection(
  p_provider text,
  p_external_account_id text,
  p_account_name text,
  p_handle text,
  p_scopes text[],
  p_secret_json text,
  p_token_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_role text;
  v_connection_id uuid;
  v_secret_id uuid;
  v_secret_name text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_provider not in ('instagram', 'x', 'google') then
    raise exception 'unsupported provider';
  end if;

  if nullif(btrim(p_external_account_id), '') is null
     or nullif(btrim(p_account_name), '') is null
     or nullif(btrim(p_secret_json), '') is null then
    raise exception 'invalid connection payload';
  end if;

  select om.organization_id, om.role
    into v_organization_id, v_role
  from public.organization_members om
  where om.user_id = v_user_id
  limit 1;

  if v_organization_id is null or v_role <> 'owner' then
    raise exception 'owner required';
  end if;

  select pc.id, pc.vault_secret_id
    into v_connection_id, v_secret_id
  from public.provider_connections pc
  where pc.organization_id = v_organization_id
    and pc.provider = p_provider
    and coalesce(pc.external_account_id, '') = p_external_account_id
  limit 1;

  if v_secret_id is null then
    v_secret_name :=
      'omnibox-oauth-' || p_provider || '-' || gen_random_uuid()::text;
    v_secret_id := vault.create_secret(
      p_secret_json,
      v_secret_name,
      'OmniBox OAuth token bundle',
      null
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_secret_json,
      null,
      'OmniBox OAuth token bundle',
      null
    );
  end if;

  if v_connection_id is null then
    insert into public.provider_connections (
      organization_id,
      provider,
      external_account_id,
      account_name,
      handle,
      status,
      scopes,
      vault_secret_id,
      token_expires_at,
      connected_by,
      metadata
    )
    values (
      v_organization_id,
      p_provider,
      p_external_account_id,
      p_account_name,
      nullif(btrim(p_handle), ''),
      'active',
      coalesce(p_scopes, '{}'),
      v_secret_id,
      p_token_expires_at,
      v_user_id,
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning provider_connections.id into v_connection_id;
  else
    update public.provider_connections
    set account_name = p_account_name,
        handle = nullif(btrim(p_handle), ''),
        status = 'active',
        scopes = coalesce(p_scopes, '{}'),
        vault_secret_id = v_secret_id,
        token_expires_at = p_token_expires_at,
        connected_by = v_user_id,
        metadata = coalesce(p_metadata, '{}'::jsonb),
        updated_at = now()
    where provider_connections.id = v_connection_id;
  end if;

  return v_connection_id;
end;
$$;

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

  delete from public.provider_connections
  where id = v_connection.id;

  if v_connection.vault_secret_id is not null then
    delete from vault.secrets
    where id = v_connection.vault_secret_id;
  end if;

  return true;
end;
$$;

revoke all on function public.omnibox_list_provider_connections() from public;
revoke all on function public.omnibox_store_oauth_connection(text,text,text,text,text[],text,timestamptz,jsonb) from public;
revoke all on function public.omnibox_delete_provider_connection(uuid) from public;

grant execute on function public.omnibox_list_provider_connections() to authenticated;
grant execute on function public.omnibox_store_oauth_connection(text,text,text,text,text[],text,timestamptz,jsonb) to authenticated;
grant execute on function public.omnibox_delete_provider_connection(uuid) to authenticated;
