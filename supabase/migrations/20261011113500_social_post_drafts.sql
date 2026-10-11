-- Allow incomplete drafts; preserve strict validation for scheduled/published posts.
alter table public.social_posts drop constraint if exists social_posts_content_not_blank;
alter table public.social_posts add constraint social_posts_content_not_blank
check (status = 'draft' or btrim(content) <> '');
alter table public.social_posts drop constraint if exists social_posts_targets_not_empty;
alter table public.social_posts add constraint social_posts_targets_not_empty
check (status = 'draft' or cardinality(target_connection_ids) > 0);
alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check
check (status in ('draft','scheduled','publishing','published','partial_failed','failed','cancelled'));
