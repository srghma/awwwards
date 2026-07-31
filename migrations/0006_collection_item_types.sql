ALTER TABLE collection_items
  DROP CONSTRAINT IF EXISTS collection_items_element_slug_fkey;

ALTER TABLE collection_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'inspiration';

ALTER TABLE collection_items
  ADD COLUMN IF NOT EXISTS item_url TEXT;

UPDATE collection_items
SET item_type = CASE
  WHEN raw_json LIKE '%"type":"submission"%' THEN 'site'
  ELSE 'inspiration'
END
WHERE item_type = 'inspiration';

UPDATE collection_items
SET item_url = CASE
  WHEN item_type = 'site' THEN 'https://www.awwwards.com/sites/' || element_slug
  ELSE 'https://www.awwwards.com/inspiration/' || element_slug
END
WHERE item_url IS NULL;

ALTER TABLE collection_items
  DROP CONSTRAINT IF EXISTS collection_items_item_type_check;

ALTER TABLE collection_items
  ADD CONSTRAINT collection_items_item_type_check
  CHECK (item_type IN ('site', 'inspiration'));
