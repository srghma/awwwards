CREATE TABLE IF NOT EXISTS site_crawl_queue (
  source_url TEXT NOT NULL CHECK (source_url ~* '^https?://'),
  site_slug TEXT NOT NULL CHECK (length(site_slug) > 0),
  site_url TEXT NOT NULL CHECK (site_url ~* '^https?://'),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_url, site_slug),
  UNIQUE (source_url, site_url)
);

CREATE INDEX IF NOT EXISTS site_crawl_queue_source_url_idx ON site_crawl_queue (source_url);
