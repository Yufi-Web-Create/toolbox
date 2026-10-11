-- Keep X-specific copy separate from the shared Instagram caption.
alter table public.social_posts
  add column if not exists x_content text;
