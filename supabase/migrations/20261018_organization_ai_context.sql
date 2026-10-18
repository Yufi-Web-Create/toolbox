-- Organization-specific reference facts and AI writing policy.
create table if not exists public.organization_ai_context (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  business_information text not null default '',
  writing_instructions text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint business_information_limit check (char_length(business_information) <= 12000),
  constraint writing_instructions_limit check (char_length(writing_instructions) <= 6000)
);
alter table public.organization_ai_context enable row level security;

create policy organization_ai_context_member_read on public.organization_ai_context
 for select to authenticated using (exists (
   select 1 from public.organization_members m
    where m.organization_id=organization_ai_context.organization_id
      and m.user_id=(select auth.uid())
 ));
create policy organization_ai_context_owner_insert on public.organization_ai_context
 for insert to authenticated with check (exists (
   select 1 from public.organization_members m
    where m.organization_id=organization_ai_context.organization_id
      and m.user_id=(select auth.uid()) and m.role='owner'
 ));
create policy organization_ai_context_owner_update on public.organization_ai_context
 for update to authenticated using (exists (
   select 1 from public.organization_members m
    where m.organization_id=organization_ai_context.organization_id
      and m.user_id=(select auth.uid()) and m.role='owner'
 )) with check (exists (
   select 1 from public.organization_members m
    where m.organization_id=organization_ai_context.organization_id
      and m.user_id=(select auth.uid()) and m.role='owner'
 ));
grant select,insert,update on public.organization_ai_context to authenticated;
