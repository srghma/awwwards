CREATE TABLE IF NOT EXISTS scrape_progress (
  worker_id TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  current_url TEXT,
  discovered INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scrape_progress_updated_at_idx ON scrape_progress (updated_at DESC);
