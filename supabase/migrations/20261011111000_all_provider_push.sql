alter table public.messages add column if not exists push_notified_at timestamptz;

create or replace function public.matomeet_notify_new_message()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_provider text;
begin
  if new.direction <> 'inbound' then return new; end if;
  select provider into v_provider from public.conversations
    where id = new.conversation_id and organization_id = new.organization_id;
  if v_provider in ('instagram', 'x', 'email') then
    perform net.http_post(
      url := 'https://omnibox-line-bridge.onrender.com/internal/push/dispatch',
      body := jsonb_build_object('organizationId', new.organization_id, 'messageId', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  end if;
  return new;
exception when others then
  raise warning 'Notification enqueue failed';
  return new;
end; $$;

drop trigger if exists matomeet_message_push_event on public.messages;
create trigger matomeet_message_push_event
after insert on public.messages for each row execute function public.matomeet_notify_new_message();
revoke all on function public.matomeet_notify_new_message() from public, anon, authenticated;
