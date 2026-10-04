create policy "Organization owners can update their organizations"
on public.organizations
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = organizations.id
      and organization_members.user_id = (select auth.uid())
      and organization_members.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = organizations.id
      and organization_members.user_id = (select auth.uid())
      and organization_members.role = 'owner'
  )
);
