begin;

select plan(17);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'tenant-001-user-a@example.invalid'),
  ('20000000-0000-0000-0000-000000000002', 'tenant-001-user-b@example.invalid');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000001"}',
  true
);

select lives_ok(
  $$
    insert into public.organizations (id, name, created_by)
    values (
      'a0000000-0000-0000-0000-000000000001',
      'Organization A',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  'User A can create Organization A'
);

select lives_ok(
  $$
    insert into public.organization_members (
      organization_id,
      organization_created_by,
      user_id,
      role
    )
    values (
      'a0000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'owner'
    )
  $$,
  'User A can create their owner membership for Organization A'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-0000-0000-000000000002"}',
  true
);

select lives_ok(
  $$
    insert into public.organizations (id, name, created_by)
    values (
      'b0000000-0000-0000-0000-000000000002',
      'Organization B',
      '20000000-0000-0000-0000-000000000002'
    )
  $$,
  'User B can create Organization B'
);

select lives_ok(
  $$
    insert into public.organization_members (
      organization_id,
      organization_created_by,
      user_id,
      role
    )
    values (
      'b0000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000002',
      'owner'
    )
  $$,
  'User B can create their owner membership for Organization B'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000001"}',
  true
);

select is(
  (select count(*) from public.organizations where id = 'a0000000-0000-0000-0000-000000000001'),
  1::bigint,
  'User A can read Organization A'
);

select is(
  (select count(*) from public.organizations where id = 'b0000000-0000-0000-0000-000000000002'),
  0::bigint,
  'User A cannot read Organization B'
);

select is(
  (select count(*) from public.organization_members where organization_id = 'a0000000-0000-0000-0000-000000000001'),
  1::bigint,
  'User A can read their own membership'
);

select throws_ok(
  $$
    insert into public.organization_members (
      organization_id,
      organization_created_by,
      user_id,
      role
    ) values (
      'b0000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'owner'
    )
  $$,
  '23503',
  'insert or update on table "organization_members" violates foreign key constraint "organization_members_organization_creator_fkey"',
  'User A cannot self-join Organization B'
);

select throws_ok(
  $$
    insert into public.organization_members (
      organization_id,
      organization_created_by,
      user_id,
      role
    ) values (
      'a0000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      'owner'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "organization_members"',
  'User A cannot create a membership for User B'
);

select throws_ok(
  $$
    insert into public.organization_members (
      organization_id,
      organization_created_by,
      user_id,
      role
    ) values (
      'a0000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      'owner'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "organization_members"',
  'User A cannot use a mismatched organization creator id'
);

select throws_ok(
  $$
    insert into public.organization_members (
      organization_id,
      organization_created_by,
      user_id,
      role
    ) values (
      'a0000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'member'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "organization_members"',
  'A non-owner initial membership is rejected'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-0000-0000-000000000002"}',
  true
);

select is(
  (select count(*) from public.organizations where id = 'b0000000-0000-0000-0000-000000000002'),
  1::bigint,
  'User B can read Organization B'
);

select is(
  (select count(*) from public.organizations where id = 'a0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'User B cannot read Organization A'
);

select is(
  (select count(*) from public.organization_members where organization_id = 'b0000000-0000-0000-0000-000000000002'),
  1::bigint,
  'User B can read their own membership'
);

select throws_ok(
  $$
    insert into public.organization_members (
      organization_id,
      organization_created_by,
      user_id,
      role
    ) values (
      'a0000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000002',
      'owner'
    )
  $$,
  '23503',
  'insert or update on table "organization_members" violates foreign key constraint "organization_members_organization_creator_fkey"',
  'User B cannot self-join Organization A'
);

reset role;

select throws_ok(
  $$
    insert into public.organizations (name, created_by)
    values ('   ', '10000000-0000-0000-0000-000000000001')
  $$,
  '23514',
  'new row for relation "organizations" violates check constraint "organizations_name_not_blank"',
  'Blank organization names are rejected'
);

select throws_ok(
  $$
    insert into public.organization_members (
      organization_id,
      organization_created_by,
      user_id,
      role
    ) values (
      'a0000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'administrator'
    )
  $$,
  '23514',
  'new row for relation "organization_members" violates check constraint "organization_members_role_check"',
  'Roles outside owner and member are rejected'
);

select * from finish();
rollback;
