begin;

select plan(10);

insert into auth.users (id, email)
values
  ('30000000-0000-0000-0000-000000000003', 'inbox-001-user-a@example.invalid'),
  ('40000000-0000-0000-0000-000000000004', 'inbox-001-user-b@example.invalid');

insert into public.organizations (id, name, created_by)
values
  (
    'c0000000-0000-0000-0000-000000000003',
    'Inbox Organization A',
    '30000000-0000-0000-0000-000000000003'
  ),
  (
    'd0000000-0000-0000-0000-000000000004',
    'Inbox Organization B',
    '40000000-0000-0000-0000-000000000004'
  );

insert into public.organization_members (
  organization_id,
  organization_created_by,
  user_id,
  role
)
values
  (
    'c0000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000003',
    'owner'
  ),
  (
    'd0000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000004',
    'owner'
  );

insert into public.conversations (
  id,
  organization_id,
  provider,
  provider_thread_id,
  customer_external_id,
  customer_display_name,
  last_message_preview
)
values
  (
    'c1000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000003',
    'line',
    'line:user:UA',
    'UA',
    'Customer A',
    'Message A'
  ),
  (
    'd1000000-0000-0000-0000-000000000004',
    'd0000000-0000-0000-0000-000000000004',
    'line',
    'line:user:UB',
    'UB',
    'Customer B',
    'Message B'
  );

insert into public.messages (
  organization_id,
  conversation_id,
  provider_message_id,
  direction,
  body
)
values
  (
    'c0000000-0000-0000-0000-000000000003',
    'c1000000-0000-0000-0000-000000000003',
    'line-message-a',
    'inbound',
    'Message A'
  ),
  (
    'd0000000-0000-0000-0000-000000000004',
    'd1000000-0000-0000-0000-000000000004',
    'line-message-b',
    'inbound',
    'Message B'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"30000000-0000-0000-0000-000000000003"}',
  true
);

select is(
  (select count(*) from public.conversations),
  1::bigint,
  'User A can read only Organization A conversations'
);

select is(
  (select count(*) from public.messages),
  1::bigint,
  'User A can read only Organization A messages'
);

select is(
  (select customer_display_name from public.conversations limit 1),
  'Customer A',
  'User A sees the expected conversation'
);

select is(
  (select body from public.messages limit 1),
  'Message A',
  'User A sees the expected message'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"40000000-0000-0000-0000-000000000004"}',
  true
);

select is(
  (select count(*) from public.conversations),
  1::bigint,
  'User B can read only Organization B conversations'
);

select is(
  (select count(*) from public.messages),
  1::bigint,
  'User B can read only Organization B messages'
);

reset role;

select is(
  has_table_privilege('authenticated', 'public.conversations', 'INSERT'),
  false,
  'Authenticated browser role cannot insert conversations'
);

select is(
  has_table_privilege('authenticated', 'public.conversations', 'UPDATE'),
  false,
  'Authenticated browser role cannot update conversations'
);

select is(
  has_table_privilege('authenticated', 'public.messages', 'INSERT'),
  false,
  'Authenticated browser role cannot insert messages'
);

select is(
  has_table_privilege('authenticated', 'public.messages', 'UPDATE'),
  false,
  'Authenticated browser role cannot update messages'
);

select * from finish();
rollback;
