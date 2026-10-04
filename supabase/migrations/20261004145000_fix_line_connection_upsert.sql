create or replace function public.omnibox_update_line_connection_metadata(
  p_account_name text,
  p_channel_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_role text;
  v_connection_id uuid;
begin
  if v_user_id is null then
    return false;
  end if;

  select om.organization_id, om.role
    into v_organization_id, v_role
  from public.organization_members om
  where om.user_id = v_user_id
  limit 1;

  if v_organization_id is null or v_role <> 'owner' then
    return false;
  end if;

  select pc.id
    into v_connection_id
  from public.provider_connections pc
  where pc.organization_id = v_organization_id
    and pc.provider = 'line'
  order by pc.created_at asc
  limit 1;

  if v_connection_id is null then
    insert into public.provider_connections (
      organization_id,
      provider,
      external_account_id,
      account_name,
      handle,
      status,
      scopes,
      connected_by,
      metadata
    )
    values (
      v_organization_id,
      'line',
      nullif(btrim(p_channel_id), ''),
      coalesce(nullif(btrim(p_account_name), ''), 'LINE公式アカウント'),
      case
        when nullif(btrim(p_channel_id), '') is null then 'Messaging API'
        else 'Channel ID: ' || btrim(p_channel_id)
      end,
      'active',
      '{}'::text[],
      v_user_id,
      '{}'::jsonb
    )
    returning id into v_connection_id;
  else
    update public.provider_connections
    set external_account_id = nullif(btrim(p_channel_id), ''),
        account_name = coalesce(nullif(btrim(p_account_name), ''), 'LINE公式アカウント'),
        handle = case
          when nullif(btrim(p_channel_id), '') is null then 'Messaging API'
          else 'Channel ID: ' || btrim(p_channel_id)
        end,
        status = 'active',
        connected_by = v_user_id,
        updated_at = now()
    where id = v_connection_id;
  end if;

  return v_connection_id is not null;
end;
$function$;

revoke all on function public.omnibox_update_line_connection_metadata(text, text)
  from public, anon;
grant execute on function public.omnibox_update_line_connection_metadata(text, text)
  to authenticated;
