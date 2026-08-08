BEGIN;

ALTER TABLE public.share_links
  DROP CONSTRAINT IF EXISTS share_links_content_kind_check;

ALTER TABLE public.share_links
  ADD CONSTRAINT share_links_content_kind_check
  CHECK (
    content_kind IN (
      'listing',
      'neighborhood',
      'community',
      'development',
      'market',
      'guide',
      'news'
    )
  );

COMMIT;
