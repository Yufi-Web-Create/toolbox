-- MatoMeet BILLING-002: no self-service upgrades without verified payment
-- New organizations start on the free tier. Existing organizations are unchanged.
alter table public.organizations alter column plan_key set default 'lite';

-- Authenticated owners may downgrade to free. Paid upgrades must be applied by
-- trusted billing/webhook code, not this browser-accessible SECURITY DEFINER RPC.
create or replace function public.omnibox_update_organization_plan(
  p_organization_id uuid, p_plan_key text
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_plan_key <> 'lite' then return false; end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid() and om.role = 'owner'
  ) then return false; end if;
  update public.organizations set plan_key = 'lite' where id = p_organization_id;
  return found;
end;
$$;
revoke all on function public.omnibox_update_organization_plan(uuid, text) from public;
grant execute on function public.omnibox_update_organization_plan(uuid, text) to authenticated;
