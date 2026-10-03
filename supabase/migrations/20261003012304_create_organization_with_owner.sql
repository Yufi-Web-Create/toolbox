create function public.create_organization_with_owner(p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  new_organization_id uuid;
begin
  if authenticated_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  insert into public.organizations (name, created_by)
  values (trim(p_name), authenticated_user_id)
  returning id into new_organization_id;

  insert into public.organization_members (
    organization_id,
    organization_created_by,
    user_id,
    role
  )
  values (
    new_organization_id,
    authenticated_user_id,
    authenticated_user_id,
    'owner'
  );

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_with_owner(text)
  from public, anon, authenticated;

grant execute on function public.create_organization_with_owner(text)
  to authenticated;
