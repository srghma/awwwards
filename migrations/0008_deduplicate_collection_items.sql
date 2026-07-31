WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY collection_slug, item_type, title
      ORDER BY
        CASE WHEN element_slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 1 ELSE 0 END,
        ctid
    ) AS duplicate_rank
  FROM collection_items
)
DELETE FROM collection_items item
USING ranked duplicate
WHERE item.ctid = duplicate.ctid
  AND duplicate.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS collection_items_collection_type_title_uidx
  ON collection_items (collection_slug, item_type, title);

CREATE UNIQUE INDEX IF NOT EXISTS collection_items_collection_url_uidx
  ON collection_items (collection_slug, item_url);
