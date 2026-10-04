alter table public.social_posts
  add column if not exists media_urls text[] not null default '{}'::text[];

update public.social_posts
set media_urls = array[media_url]
where media_url is not null
  and btrim(media_url) <> ''
  and cardinality(media_urls) = 0;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-post-media',
  'social-post-media',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization members can upload social post media" on storage.objects;
create policy "Organization members can upload social post media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'social-post-media'
  and exists (
    select 1 from public.organization_members m
    where m.user_id = (select auth.uid())
      and m.organization_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Organization members can read social post media" on storage.objects;
create policy "Organization members can read social post media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'social-post-media'
  and exists (
    select 1 from public.organization_members m
    where m.user_id = (select auth.uid())
      and m.organization_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Organization members can delete social post media" on storage.objects;
create policy "Organization members can delete social post media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'social-post-media'
  and exists (
    select 1 from public.organization_members m
    where m.user_id = (select auth.uid())
      and m.organization_id::text = (storage.foldername(name))[1]
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end
$$;
