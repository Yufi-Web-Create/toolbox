-- Billing state belongs to an organization; only server-side service_role writes it.
create table if not exists public.organization_billing (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 stripe_customer_id text unique,
 stripe_subscription_id text unique,
 stripe_price_id text,
 stripe_status text not null default 'inactive',
 stripe_current_period_end timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.stripe_billing_events (
 event_id text primary key,
 event_type text not null,
 processed_at timestamptz not null default now()
);
alter table public.organization_billing enable row level security;
alter table public.stripe_billing_events enable row level security;
revoke all on public.organization_billing from anon, authenticated;
revoke all on public.stripe_billing_events from anon, authenticated;

-- Idempotency and subscription-plan changes must be one transaction.
create or replace function public.matomeet_apply_stripe_subscription(
 p_event_id text, p_event_type text, p_organization_id uuid,
 p_customer_id text, p_subscription_id text,
 p_price_id text, p_status text, p_plan text, p_period_end timestamptz default null
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_inserted int;
begin
 if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
 if p_event_id is null or p_event_id = '' or p_subscription_id is null or p_subscription_id = '' then raise exception 'invalid event'; end if;
 if p_plan not in ('lite','standard','pro','premium') then raise exception 'invalid plan'; end if;
 -- Serialize updates per organization to avoid conflicting webhook delivery.
 perform 1 from public.organizations where id = p_organization_id for update;
 if not found then raise exception 'unknown organization'; end if;
 insert into public.stripe_billing_events(event_id,event_type) values(p_event_id,p_event_type)
 on conflict do nothing;
 get diagnostics v_inserted = row_count;
 if v_inserted = 0 then return false; end if;
 insert into public.organization_billing
 (organization_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,stripe_status,stripe_current_period_end)
 values(p_organization_id,p_customer_id,p_subscription_id,p_price_id,p_status,p_period_end)
 on conflict(organization_id) do update set
 stripe_customer_id=excluded.stripe_customer_id,
 stripe_subscription_id=excluded.stripe_subscription_id,
 stripe_price_id=excluded.stripe_price_id,
 stripe_status=excluded.stripe_status,
 stripe_current_period_end=excluded.stripe_current_period_end,
 updated_at=now();
 update public.organizations set plan_key =
 case when p_status in ('active','trialing') then p_plan else 'lite' end
 where id = p_organization_id;
 return true;
end; $$;
revoke all on function public.matomeet_apply_stripe_subscription(text,text,uuid,text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.matomeet_apply_stripe_subscription(text,text,uuid,text,text,text,text,text,timestamptz) to service_role;
