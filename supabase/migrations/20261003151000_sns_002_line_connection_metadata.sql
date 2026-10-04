create or replace function public.omnibox_update_line_connection_metadata(
  p_account_name text,
  p_channel_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_role text;
begin
  select om.organization_id, om.role
    into v_organization_id, v_role
  from public.organization_members om
  where om.user_id = v_user_id
  limit 1;

  if v_organization_id is null or v_role <> 'owner' then
    return false;
  end if;

  update public.provider_connections
  set account_name = coalesce(nullif(btrim(p_account_name), ''), 'LINE公式アカウント'),
      handle = case
        when nullif(btrim(p_channel_id), '') is null then 'Messaging API'
        else 'Channel ID: ' || btrim(p_channel_id)
      end,
      status = 'active',
      connected_by = v_user_id,
      updated_at = now()
  where organization_id = v_organization_id
    and provider = 'line';

  return found;
end;
$$;

revoke all on function public.omnibox_update_line_connection_metadata(text,text) from public;
grant execute on function public.omnibox_update_line_connection_metadata(text,text) to authenticated;
