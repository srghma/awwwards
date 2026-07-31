ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_pro BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS works_count INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS award_soty_count INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS award_sotm_count INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS award_sotd_count INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS award_hm_count INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS raw_json TEXT;

ALTER TABLE collections ADD COLUMN IF NOT EXISTS category_name TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS creator_username TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS creator_name TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS followers_count INTEGER;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS items_count INTEGER;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS raw_json TEXT;

ALTER TABLE elements ADD COLUMN IF NOT EXISTS author_username TEXT;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS media_static_url TEXT;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS tags_json TEXT;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS raw_json TEXT;

CREATE TABLE IF NOT EXISTS collection_items (
  collection_slug TEXT NOT NULL REFERENCES collections(slug) ON DELETE CASCADE,
  element_slug TEXT NOT NULL REFERENCES elements(slug) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) > 0),
  author_username TEXT,
  author_name TEXT,
  website_url TEXT,
  media_url TEXT,
  media_static_url TEXT,
  tags_json TEXT,
  raw_json TEXT,
  PRIMARY KEY (collection_slug, element_slug)
);
