alter table public.operator_provider_configs
  drop constraint if exists operator_provider_configs_provider_check;

alter table public.operator_provider_configs
  add constraint operator_provider_configs_provider_check
  check (
    provider = any (
      array['instagram'::text, 'x'::text, 'google'::text, 'ai'::text]
    )
  );
