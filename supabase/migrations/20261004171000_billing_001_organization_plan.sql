alter table public.organizations
  add column if not exists plan_key text not null default 'standard';

alter table public.organizations
  drop constraint if exists organizations_plan_key_check;

alter table public.organizations
  add constraint organizations_plan_key_check
  check (plan_key in ('lite','standard','pro','premium','enterprise'));

create or replace function public.omnibox_update_organization_plan(
  p_organization_id uuid,
  p_plan_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_plan_key not in ('lite','standard','pro','premium','enterprise') then
    return false;
  end if;

  if not exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.role = 'owner'
  ) then
    return false;
  end if;

  update public.organizations
  set plan_key = p_plan_key
  where id = p_organization_id;

  return found;
end;
$$;

revoke all on function public.omnibox_update_organization_plan(uuid, text) from public;
grant execute on function public.omnibox_update_organization_plan(uuid, text) to authenticated;
