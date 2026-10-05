drop policy if exists "Organization members can delete conversations" on public.conversations;

create policy "Organization members can delete conversations"
on public.conversations
for delete
to authenticated
using (
  exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = conversations.organization_id
      and organization_members.user_id = (select auth.uid())
  )
);
