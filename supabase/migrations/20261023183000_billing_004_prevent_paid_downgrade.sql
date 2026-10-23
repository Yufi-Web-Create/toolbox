-- Do not allow a browser request to switch an organization to Lite while
-- Stripe continues charging it. The Stripe Customer Portal controls cancellation.
create or replace function public.omnibox_update_organization_plan(
  p_organization_id uuid, p_plan_key text
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_plan_key <> 'lite' then return false; end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid() and m.role = 'owner'
  ) then return false; end if;
  -- Lock organization row to serialize against Stripe webhook changes.
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then return false; end if;
  if exists (
    select 1 from public.billing_subscriptions b
    where b.organization_id = p_organization_id
      and b.status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused')
  ) then return false; end if;
  update public.organizations set plan_key = 'lite' where id = p_organization_id;
  return found;
end;
$$;
revoke all on function public.omnibox_update_organization_plan(uuid,text) from public, anon;
grant execute on function public.omnibox_update_organization_plan(uuid,text) to authenticated;
