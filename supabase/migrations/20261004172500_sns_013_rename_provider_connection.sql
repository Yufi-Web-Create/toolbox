create or replace function public.omnibox_rename_provider_connection(
  p_connection_id uuid,
  p_account_name text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_account_name, ''));
begin
  if v_name = '' or char_length(v_name) > 120 then
    return false;
  end if;

  if not exists (
    select 1
    from public.provider_connections pc
    join public.organization_members om
      on om.organization_id = pc.organization_id
    where pc.id = p_connection_id
      and om.user_id = auth.uid()
      and om.role = 'owner'
  ) then
    return false;
  end if;

  update public.provider_connections
  set account_name = v_name,
      updated_at = now()
  where id = p_connection_id;

  return found;
end;
$$;

revoke all on function public.omnibox_rename_provider_connection(uuid, text) from public;
grant execute on function public.omnibox_rename_provider_connection(uuid, text) to authenticated;
