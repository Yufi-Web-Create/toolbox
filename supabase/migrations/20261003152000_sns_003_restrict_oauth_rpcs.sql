revoke execute on function public.omnibox_list_provider_connections() from anon;
revoke execute on function public.omnibox_store_oauth_connection(text,text,text,text,text[],text,timestamptz,jsonb) from anon;
revoke execute on function public.omnibox_delete_provider_connection(uuid) from anon;
revoke execute on function public.omnibox_update_line_connection_metadata(text,text) from anon;

grant execute on function public.omnibox_list_provider_connections() to authenticated;
grant execute on function public.omnibox_store_oauth_connection(text,text,text,text,text[],text,timestamptz,jsonb) to authenticated;
grant execute on function public.omnibox_delete_provider_connection(uuid) to authenticated;
grant execute on function public.omnibox_update_line_connection_metadata(text,text) to authenticated;

create index if not exists provider_connections_connected_by_idx
  on public.provider_connections(connected_by);

create index if not exists reply_templates_created_by_idx
  on public.reply_templates(created_by);
