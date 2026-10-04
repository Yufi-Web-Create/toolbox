create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'omnibox-publish-cron-key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'omnibox-publish-cron-key',
      'Internal key for OmniBox scheduled social publishing',
      null
    );
  end if;
end $$;

create or replace function public.omnibox_get_system_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret text;
begin
  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = p_name
  limit 1;

  return v_secret;
end;
$$;

revoke all on function public.omnibox_get_system_secret(text) from public;
revoke execute on function public.omnibox_get_system_secret(text) from anon;
revoke execute on function public.omnibox_get_system_secret(text) from authenticated;
grant execute on function public.omnibox_get_system_secret(text) to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'omnibox-publish-due'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end $$;

select cron.schedule(
  'omnibox-publish-due',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://lrfjjqnsswrzuwpwtaei.supabase.co/functions/v1/omnibox-provider-publish',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-omnibox-cron-key',
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'omnibox-publish-cron-key'
          limit 1
        )
      ),
      body := jsonb_build_object('postId', p.id)
    )
    from public.social_posts p
    where p.status = 'scheduled'
      and p.scheduled_at is not null
      and p.scheduled_at <= now()
    order by p.scheduled_at asc
    limit 20;
  $cron$
);
