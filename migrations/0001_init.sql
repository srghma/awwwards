DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'award_type_enum') THEN
    CREATE TYPE award_type_enum AS ENUM ('SOTD', 'Nominee', 'Honorable Mention', 'SOTM', 'SOTY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type_enum') THEN
    CREATE TYPE media_type_enum AS ENUM ('image', 'video');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vote_type_enum') THEN
    CREATE TYPE vote_type_enum AS ENUM ('Jury', 'Community', 'DevJury');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY CHECK (length(username) > 0),
  name TEXT NOT NULL CHECK (length(name) > 0),
  avatar_url TEXT CHECK (avatar_url IS NULL OR (avatar_url ~* '^https?://' OR avatar_url ~* '^data:image')),
  profile_url TEXT CHECK (profile_url IS NULL OR (profile_url ~* '^https?://')),
  role TEXT CHECK (role IS NULL OR length(role) > 0),
  country TEXT CHECK (country IS NULL OR length(country) > 0),
  email TEXT CHECK (email IS NULL OR (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'))
);

CREATE TABLE IF NOT EXISTS sites (
  slug TEXT PRIMARY KEY CHECK (length(slug) > 0),
  title TEXT NOT NULL CHECK (length(title) > 0),
  live_url TEXT CHECK (live_url IS NULL OR (live_url ~* '^https?://')),
  awwwards_url TEXT NOT NULL CHECK (awwwards_url ~* '^https?://'),
  description TEXT CHECK (description IS NULL OR length(description) > 0),
  award_type award_type_enum NOT NULL,
  award_date TEXT CHECK (award_date IS NULL OR (length(award_date) >= 4)),
  creator_username TEXT REFERENCES users(username) ON DELETE SET NULL,
  overall_score REAL CHECK (overall_score IS NULL OR (overall_score >= 0.0 AND overall_score <= 10.0)),
  design_score REAL CHECK (design_score IS NULL OR (design_score >= 0.0 AND design_score <= 10.0)),
  usability_score REAL CHECK (usability_score IS NULL OR (usability_score >= 0.0 AND usability_score <= 10.0)),
  creativity_score REAL CHECK (creativity_score IS NULL OR (creativity_score >= 0.0 AND creativity_score <= 10.0)),
  content_score REAL CHECK (content_score IS NULL OR (content_score >= 0.0 AND content_score <= 10.0)),
  dev_overall_score REAL CHECK (dev_overall_score IS NULL OR (dev_overall_score >= 0.0 AND dev_overall_score <= 10.0)),
  dev_semantics_score REAL CHECK (dev_semantics_score IS NULL OR (dev_semantics_score >= 0.0 AND dev_semantics_score <= 10.0)),
  dev_animations_score REAL CHECK (dev_animations_score IS NULL OR (dev_animations_score >= 0.0 AND dev_animations_score <= 10.0)),
  dev_accessibility_score REAL CHECK (dev_accessibility_score IS NULL OR (dev_accessibility_score >= 0.0 AND dev_accessibility_score <= 10.0)),
  dev_wpo_score REAL CHECK (dev_wpo_score IS NULL OR (dev_wpo_score >= 0.0 AND dev_wpo_score <= 10.0)),
  dev_responsive_score REAL CHECK (dev_responsive_score IS NULL OR (dev_responsive_score >= 0.0 AND dev_responsive_score <= 10.0)),
  dev_markup_score REAL CHECK (dev_markup_score IS NULL OR (dev_markup_score >= 0.0 AND dev_markup_score <= 10.0))
);

CREATE TABLE IF NOT EXISTS site_technologies (
  site_slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  technology_name TEXT NOT NULL CHECK (length(technology_name) > 0),
  PRIMARY KEY (site_slug, technology_name)
);

CREATE TABLE IF NOT EXISTS site_colors (
  site_slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  hex_code TEXT NOT NULL CHECK (hex_code ~* '^#[0-9A-Fa-f]{3,6}$'),
  PRIMARY KEY (site_slug, hex_code)
);

CREATE TABLE IF NOT EXISTS site_media (
  site_slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  media_type media_type_enum NOT NULL,
  source_url TEXT NOT NULL CHECK (source_url ~* '^https?://' OR source_url ~* '^data:image'),
  local_path TEXT NOT NULL CHECK (length(local_path) > 0),
  PRIMARY KEY (site_slug, source_url)
);

CREATE TABLE IF NOT EXISTS votes (
  site_slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  voter_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  voter_role TEXT CHECK (voter_role IS NULL OR length(voter_role) > 0),
  vote_type vote_type_enum NOT NULL,
  design_score REAL CHECK (design_score IS NULL OR (design_score >= 0.0 AND design_score <= 10.0)),
  usability_score REAL CHECK (usability_score IS NULL OR (usability_score >= 0.0 AND usability_score <= 10.0)),
  creativity_score REAL CHECK (creativity_score IS NULL OR (creativity_score >= 0.0 AND creativity_score <= 10.0)),
  content_score REAL CHECK (content_score IS NULL OR (content_score >= 0.0 AND content_score <= 10.0)),
  overall_score REAL CHECK (overall_score IS NULL OR (overall_score >= 0.0 AND overall_score <= 10.0)),
  PRIMARY KEY (site_slug, voter_username, vote_type)
);

CREATE TABLE IF NOT EXISTS collections (
  slug TEXT PRIMARY KEY CHECK (length(slug) > 0),
  name TEXT NOT NULL CHECK (length(name) > 0),
  url TEXT NOT NULL CHECK (url ~* '^https?://'),
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  is_valuable BOOLEAN NOT NULL DEFAULT FALSE,
  clone_name_x6 TEXT CHECK (clone_name_x6 IS NULL OR length(clone_name_x6) > 0)
);

CREATE TABLE IF NOT EXISTS collection_posts (
  collection_slug TEXT NOT NULL REFERENCES collections(slug) ON DELETE CASCADE,
  site_slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  description TEXT CHECK (description IS NULL OR length(description) > 0),
  PRIMARY KEY (collection_slug, site_slug)
);

CREATE TABLE IF NOT EXISTS element_categories (
  slug TEXT PRIMARY KEY CHECK (length(slug) > 0),
  name TEXT NOT NULL CHECK (length(name) > 0),
  post_count INTEGER NOT NULL DEFAULT 0 CHECK (post_count >= 0),
  should_track BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS elements (
  slug TEXT PRIMARY KEY CHECK (length(slug) > 0),
  title TEXT NOT NULL CHECK (length(title) > 0),
  category_slug TEXT NOT NULL REFERENCES element_categories(slug) ON DELETE CASCADE,
  source_url TEXT CHECK (source_url IS NULL OR source_url ~* '^https?://')
);
