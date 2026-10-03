create index if not exists organization_members_organization_creator_idx
  on public.organization_members using btree (organization_id, organization_created_by);
