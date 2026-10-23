-- Stripe webhook is the only writer of paid entitlements.
-- Never grant UPDATE/INSERT/DELETE on this table to browser roles.
create table if not exists public.billing_subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  stripe_price_id text not null,
  status text not null,
  last_event_created bigint not null,
  last_event_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.billing_subscriptions enable row level security;
revoke all on public.billing_subscriptions from anon, authenticated;
grant select on public.billing_subscriptions to authenticated;

drop policy if exists billing_subscriptions_member_read on public.billing_subscriptions;
create policy billing_subscriptions_member_read on public.billing_subscriptions
  for select to authenticated using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = billing_subscriptions.organization_id
        and m.user_id = auth.uid()
    )
  );

-- Invoked only by the server after verifying Stripe's webhook signature.
-- Service role only; reject stale events and subscriptions belonging to another tenant.
create or replace function public.omnibox_apply_stripe_subscription(
  p_organization_id uuid,
  p_subscription_id text,
  p_customer_id text,
  p_price_id text,
  p_plan_key text,
  p_status text,
  p_event_created bigint,
  p_event_id text
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  previous public.billing_subscriptions%rowtype;
  current_org uuid;
begin
  if p_plan_key not in ('standard', 'pro')
    or p_subscription_id is null or p_subscription_id = ''
    or p_customer_id is null or p_customer_id = ''
    or p_price_id is null or p_price_id = ''
    or p_event_created <= 0 or p_event_id is null or p_event_id = '' then
    return false;
  end if;

  -- Serialize updates for this organization even when two webhooks arrive together.
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then return false; end if;

  select organization_id into current_org
  from public.billing_subscriptions
  where stripe_subscription_id = p_subscription_id;
  if current_org is not null and current_org <> p_organization_id then return false; end if;

  select * into previous from public.billing_subscriptions where organization_id = p_organization_id;
  if found and previous.last_event_created > p_event_created then return true; end if;
  if found and previous.last_event_created = p_event_created then
    if previous.last_event_id = p_event_id then return true; end if;
    -- Equal-time unordered updates are not safe to apply automatically.
    return false;
  end if;
  if found and previous.stripe_subscription_id <> p_subscription_id
    and previous.status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused') then
    return false;
  end if;

  insert into public.billing_subscriptions (
    organization_id, stripe_subscription_id, stripe_customer_id,
    stripe_price_id, status, last_event_created, last_event_id
  ) values (
    p_organization_id, p_subscription_id, p_customer_id,
    p_price_id, p_status, p_event_created, p_event_id
  )
  on conflict (organization_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    last_event_created = excluded.last_event_created,
    last_event_id = excluded.last_event_id,
    updated_at = now();

  update public.organizations set plan_key =
    case when p_status in ('active', 'trialing') then p_plan_key else 'lite' end
  where id = p_organization_id;
  return true;
end;
$$;
revoke all on function public.omnibox_apply_stripe_subscription(uuid,text,text,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.omnibox_apply_stripe_subscription(uuid,text,text,text,text,text,bigint,text) to service_role;
