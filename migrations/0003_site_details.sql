ALTER TABLE site_media ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE site_media ALTER COLUMN local_path DROP NOT NULL;

CREATE TABLE IF NOT EXISTS site_creators (
  site_slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  profile_url TEXT CHECK (profile_url IS NULL OR profile_url ~* '^https?://'),
  avatar_url TEXT CHECK (avatar_url IS NULL OR (avatar_url ~* '^https?://' OR avatar_url ~* '^data:image')),
  country TEXT CHECK (country IS NULL OR length(country) > 0),
  is_pro BOOLEAN,
  creator_order INTEGER NOT NULL DEFAULT 0 CHECK (creator_order >= 0),
  raw_json TEXT,
  PRIMARY KEY (site_slug, username)
);

CREATE TABLE IF NOT EXISTS site_tags (
  site_slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('color', 'tag')),
  value TEXT NOT NULL CHECK (length(value) > 0),
  hex_code TEXT CHECK (hex_code IS NULL OR hex_code ~* '^#[0-9A-Fa-f]{3,6}$'),
  label TEXT CHECK (label IS NULL OR length(label) > 0),
  raw_json TEXT,
  PRIMARY KEY (site_slug, tag_type, value)
);

ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_name TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_avatar_url TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_profile_url TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_country TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS voter_website_url TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS raw_json TEXT;
