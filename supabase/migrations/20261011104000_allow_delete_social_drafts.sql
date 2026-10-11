create policy "Organization members can delete drafts"
on public.social_posts for delete to authenticated
using (status = 'draft' and exists (
  select 1 from public.organization_members om
  where om.organization_id = social_posts.organization_id and om.user_id = (select auth.uid())
));
