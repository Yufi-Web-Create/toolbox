alter table public.social_posts drop constraint if exists social_posts_content_not_blank;
alter table public.social_posts add constraint social_posts_content_not_blank
check (status = 'draft' or btrim(content) <> '' or btrim(coalesce(x_content,'')) <> '' or cardinality(media_urls) > 0);
