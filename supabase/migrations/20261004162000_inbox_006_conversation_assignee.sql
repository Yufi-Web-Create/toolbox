alter table public.conversations
  add column if not exists assignee_user_id uuid references auth.users(id) on delete set null;

create index if not exists conversations_assignee_user_idx
  on public.conversations(organization_id, assignee_user_id);

revoke update on public.conversations from authenticated;
grant update(status, customer_display_name, customer_name_source, assignee_user_id, updated_at)
  on public.conversations to authenticated;
