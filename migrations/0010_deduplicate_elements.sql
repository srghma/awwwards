WITH ranked AS (
  SELECT
    e.ctid,
    ROW_NUMBER() OVER (
      PARTITION BY e.source_url
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1 FROM collection_items ci WHERE ci.element_slug = e.slug
        ) THEN 0 ELSE 1 END,
        CASE WHEN e.slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 1 ELSE 0 END,
        e.slug
    ) AS duplicate_rank
  FROM elements e
  WHERE e.source_url IS NOT NULL
)
DELETE FROM elements e
USING ranked duplicate
WHERE e.ctid = duplicate.ctid
  AND duplicate.duplicate_rank > 1
  AND NOT EXISTS (
    SELECT 1 FROM collection_items ci WHERE ci.element_slug = e.slug
  );

CREATE UNIQUE INDEX IF NOT EXISTS elements_source_url_uidx
  ON elements (source_url)
  WHERE source_url IS NOT NULL;
