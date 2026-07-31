ALTER TABLE elements ADD COLUMN IF NOT EXISTS x6_post_id TEXT DEFAULT NULL;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS x6_post_status TEXT DEFAULT NULL;
ALTER TABLE elements ADD COLUMN IF NOT EXISTS x6_post_deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE sites ADD COLUMN IF NOT EXISTS x6_content_id TEXT DEFAULT NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS x6_content_slug TEXT DEFAULT NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS x6_content_status TEXT DEFAULT NULL;

UPDATE sites SET x6_content_id = rariran_content_id, x6_content_slug = rariran_content_slug, x6_content_status = rariran_content_status WHERE rariran_content_id IS NOT NULL AND x6_content_id IS NULL;
