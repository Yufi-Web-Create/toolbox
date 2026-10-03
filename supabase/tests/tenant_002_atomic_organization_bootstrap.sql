begin;

select plan(22);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'tenant-002-user-a@example.invalid'),
  ('20000000-0000-0000-0000-000000000002', 'tenant-002-user-b@example.invalid'),
  ('30000000-0000-0000-0000-000000000003', 'tenant-002-user-c@example.invalid');

select is(
  (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'create_organization_with_owner'
      and pg_get_function_identity_arguments(oid) = 'p_name text'
  ),
  1::bigint,
  'Exactly one approved organization bootstrap function exists'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.create_organization_with_owner(text)'::regprocedure
  ),
  false,
  'The organization bootstrap function is SECURITY INVOKER'
);

select ok(
  (
    select proconfig is not null
      and cardinality(proconfig) = 1
      and split_part(proconfig[1], '=', 1) = 'search_path'
      and split_part(proconfig[1], '=', 2) in ('', '""')
    from pg_proc
    where oid = 'public.create_organization_with_owner(text)'::regprocedure
  ),
  'The organization bootstrap function has an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_organization_with_owner(text)',
    'EXECUTE'
  ),
  'Authenticated users can execute the organization bootstrap function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_organization_with_owner(text)',
    'EXECUTE'
  ),
  'Anonymous users cannot execute the organization bootstrap function'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000001"}',
  true
);

select ok(
  public.create_organization_with_owner('  Organization A  ') is not null,
  'User A receives a UUID when creating Organization A'
);

select is(
  (select count(*) from public.organizations where name = 'Organization A'),
  1::bigint,
  'Organization A is created with its name trimmed'
);

select is(
  (
    select count(*)
    from public.organization_members
    where user_id = '10000000-0000-0000-0000-000000000001'
      and organization_created_by = '10000000-0000-0000-0000-000000000001'
      and role = 'owner'
  ),
  1::bigint,
  'Organization A has exactly one owner membership for User A'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-0000-0000-000000000002"}',
  true
);

select ok(
  public.create_organization_with_owner('Organization B') is not null,
  'User B receives a UUID when creating Organization B'
);

select is(
  (select count(*) from public.organizations where name = 'Organization B'),
  1::bigint,
  'User B can read Organization B'
);

select is(
  (
    select count(*)
    from public.organization_members
    where user_id = '20000000-0000-0000-0000-000000000002'
      and organization_created_by = '20000000-0000-0000-0000-000000000002'
      and role = 'owner'
  ),
  1::bigint,
  'Organization B has exactly one owner membership for User B'
);

reset role;

select is(
  (
    select count(*)
    from public.organization_members
    where user_id <> organization_created_by
  ),
  0::bigint,
  'No cross-tenant membership is created'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000001"}',
  true
);

select is(
  (select count(*) from public.organizations where name = 'Organization B'),
  0::bigint,
  'Existing RLS prevents User A from reading Organization B'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-0000-0000-000000000002"}',
  true
);

select is(
  (select count(*) from public.organizations where name = 'Organization A'),
  0::bigint,
  'Existing RLS prevents User B from reading Organization A'
);

reset role;
set local role anon;

select throws_ok(
  $$ select public.create_organization_with_owner('Anonymous Organization') $$,
  '42501',
  'permission denied for function create_organization_with_owner',
  'Anonymous invocation is rejected'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  $$ select public.create_organization_with_owner('Missing User Organization') $$,
  '42501',
  'Authentication required',
  'An authenticated role without a user id is rejected'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000001"}',
  true
);

select throws_ok(
  $$ select public.create_organization_with_owner('   ') $$,
  '23514',
  'new row for relation "organizations" violates check constraint "organizations_name_not_blank"',
  'A blank organization name is rejected by the existing constraint'
);

reset role;

select is(
  (select count(*) from public.organizations where btrim(name) = ''),
  0::bigint,
  'A rejected blank organization is not committed'
);

revoke insert on table public.organization_members from authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"30000000-0000-0000-0000-000000000003"}',
  true
);

select throws_ok(
  $$ select public.create_organization_with_owner('Rollback Organization') $$,
  '42501',
  'permission denied for table organization_members',
  'A forced membership insertion failure rejects the RPC'
);

reset role;
grant insert on table public.organization_members to authenticated;

select is(
  (select count(*) from public.organizations where name = 'Rollback Organization'),
  0::bigint,
  'A membership insertion failure rolls back the organization insert'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000001"}',
  true
);

select is(
  (select count(*) from public.organizations where name = 'Organization A'),
  1::bigint,
  'User A retains access to their own organization under existing RLS'
);

select is(
  (select count(*) from public.organization_members),
  1::bigint,
  'User A can read only their own owner membership under existing RLS'
);

select * from finish();
rollback;
