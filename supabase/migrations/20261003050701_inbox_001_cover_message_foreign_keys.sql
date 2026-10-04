create index messages_conversation_organization_fk_idx
  on public.messages (conversation_id, organization_id);

create index messages_sent_by_user_id_idx
  on public.messages (sent_by_user_id);
