CREATE TABLE IF NOT EXISTS element_crawl_queue (
  source_url TEXT NOT NULL CHECK (source_url ~* '^https?://'),
  element_slug TEXT NOT NULL CHECK (length(element_slug) > 0),
  element_url TEXT NOT NULL CHECK (element_url ~* '^https?://'),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_url, element_slug),
  UNIQUE (source_url, element_url)
);

CREATE INDEX IF NOT EXISTS element_crawl_queue_source_url_idx ON element_crawl_queue (source_url);
