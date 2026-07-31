DELETE FROM site_media
WHERE source_url ILIKE '%blank_static%';

UPDATE site_media
SET preview_url = NULL,
    local_path = NULL
WHERE COALESCE(preview_url, '') ILIKE '%blank_static%'
   OR COALESCE(local_path, '') ILIKE '%blank_static%';

UPDATE elements
SET media_url = CASE WHEN COALESCE(media_url, '') ILIKE '%blank_static%' THEN NULL ELSE NULLIF(BTRIM(media_url), '') END,
    media_static_url = CASE WHEN COALESCE(media_static_url, '') ILIKE '%blank_static%' THEN NULL ELSE NULLIF(BTRIM(media_static_url), '') END,
    rariran_file_url = CASE WHEN COALESCE(rariran_file_url, '') ILIKE '%blank_static%' THEN NULL ELSE NULLIF(BTRIM(rariran_file_url), '') END,
    rariran_file_webp_url = CASE WHEN COALESCE(rariran_file_webp_url, '') ILIKE '%blank_static%' THEN NULL ELSE NULLIF(BTRIM(rariran_file_webp_url), '') END,
    rariran_file_filename = CASE WHEN COALESCE(rariran_file_filename, '') ILIKE '%blank_static%' THEN NULL ELSE NULLIF(BTRIM(rariran_file_filename), '') END,
    rariran_file_thumbnail = CASE WHEN COALESCE(rariran_file_thumbnail, '') ILIKE '%blank_static%' THEN NULL ELSE NULLIF(BTRIM(rariran_file_thumbnail), '') END,
    raw_json = CASE WHEN COALESCE(raw_json, '') ILIKE '%blank_static%' THEN NULL ELSE raw_json END,
    rariran_file_raw_json = CASE WHEN COALESCE(rariran_file_raw_json, '') ILIKE '%blank_static%' THEN NULL ELSE rariran_file_raw_json END
WHERE COALESCE(media_url, '') ILIKE '%blank_static%'
   OR COALESCE(media_static_url, '') ILIKE '%blank_static%'
   OR COALESCE(rariran_file_url, '') ILIKE '%blank_static%'
   OR COALESCE(rariran_file_webp_url, '') ILIKE '%blank_static%'
   OR COALESCE(rariran_file_filename, '') ILIKE '%blank_static%'
   OR COALESCE(rariran_file_thumbnail, '') ILIKE '%blank_static%'
   OR COALESCE(raw_json, '') ILIKE '%blank_static%'
   OR COALESCE(rariran_file_raw_json, '') ILIKE '%blank_static%';

UPDATE collection_items
SET media_url = CASE WHEN COALESCE(media_url, '') ILIKE '%blank_static%' THEN NULL ELSE NULLIF(BTRIM(media_url), '') END,
    media_static_url = CASE WHEN COALESCE(media_static_url, '') ILIKE '%blank_static%' THEN NULL ELSE NULLIF(BTRIM(media_static_url), '') END,
    raw_json = CASE WHEN COALESCE(raw_json, '') ILIKE '%blank_static%' THEN NULL ELSE raw_json END
WHERE COALESCE(media_url, '') ILIKE '%blank_static%'
   OR COALESCE(media_static_url, '') ILIKE '%blank_static%'
   OR COALESCE(raw_json, '') ILIKE '%blank_static%';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'elements_media_url_no_blank_static') THEN
    ALTER TABLE elements ADD CONSTRAINT elements_media_url_no_blank_static CHECK (media_url IS NULL OR media_url NOT ILIKE '%blank_static%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'elements_media_static_url_no_blank_static') THEN
    ALTER TABLE elements ADD CONSTRAINT elements_media_static_url_no_blank_static CHECK (media_static_url IS NULL OR media_static_url NOT ILIKE '%blank_static%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_items_media_url_no_blank_static') THEN
    ALTER TABLE collection_items ADD CONSTRAINT collection_items_media_url_no_blank_static CHECK (media_url IS NULL OR media_url NOT ILIKE '%blank_static%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_items_media_static_url_no_blank_static') THEN
    ALTER TABLE collection_items ADD CONSTRAINT collection_items_media_static_url_no_blank_static CHECK (media_static_url IS NULL OR media_static_url NOT ILIKE '%blank_static%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_media_preview_url_no_blank_static') THEN
    ALTER TABLE site_media ADD CONSTRAINT site_media_preview_url_no_blank_static CHECK (preview_url IS NULL OR preview_url NOT ILIKE '%blank_static%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_media_source_url_no_blank_static') THEN
    ALTER TABLE site_media ADD CONSTRAINT site_media_source_url_no_blank_static CHECK (source_url NOT ILIKE '%blank_static%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_media_local_path_no_blank_static') THEN
    ALTER TABLE site_media ADD CONSTRAINT site_media_local_path_no_blank_static CHECK (local_path IS NULL OR local_path NOT ILIKE '%blank_static%');
  END IF;
END $$;
