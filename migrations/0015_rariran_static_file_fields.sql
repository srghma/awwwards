ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_id TEXT CHECK (rariran_static_file_id IS NULL OR length(rariran_static_file_id) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_url TEXT CHECK (rariran_static_file_url IS NULL OR length(rariran_static_file_url) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_webp_url TEXT CHECK (rariran_static_file_webp_url IS NULL OR length(rariran_static_file_webp_url) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_width INTEGER CHECK (rariran_static_file_width IS NULL OR rariran_static_file_width >= 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_height INTEGER CHECK (rariran_static_file_height IS NULL OR rariran_static_file_height >= 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_created_at TEXT CHECK (rariran_static_file_created_at IS NULL OR length(rariran_static_file_created_at) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_updated_at TEXT CHECK (rariran_static_file_updated_at IS NULL OR length(rariran_static_file_updated_at) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_mimetype TEXT CHECK (rariran_static_file_mimetype IS NULL OR length(rariran_static_file_mimetype) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_extension TEXT CHECK (rariran_static_file_extension IS NULL OR length(rariran_static_file_extension) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_size BIGINT CHECK (rariran_static_file_size IS NULL OR rariran_static_file_size >= 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_filename TEXT CHECK (rariran_static_file_filename IS NULL OR length(rariran_static_file_filename) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_thumbnail TEXT CHECK (rariran_static_file_thumbnail IS NULL OR length(rariran_static_file_thumbnail) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_static_file_raw_json TEXT CHECK (rariran_static_file_raw_json IS NULL OR length(rariran_static_file_raw_json) > 0);

UPDATE elements
SET rariran_static_file_id = rariran_file_id,
    rariran_static_file_url = rariran_file_url,
    rariran_static_file_webp_url = rariran_file_webp_url,
    rariran_static_file_width = rariran_file_width,
    rariran_static_file_height = rariran_file_height,
    rariran_static_file_created_at = rariran_file_created_at,
    rariran_static_file_updated_at = rariran_file_updated_at,
    rariran_static_file_mimetype = rariran_file_mimetype,
    rariran_static_file_extension = rariran_file_extension,
    rariran_static_file_size = rariran_file_size,
    rariran_static_file_filename = rariran_file_filename,
    rariran_static_file_thumbnail = rariran_file_thumbnail,
    rariran_static_file_raw_json = rariran_file_raw_json,
    rariran_file_id = NULL,
    rariran_file_url = NULL,
    rariran_file_webp_url = NULL,
    rariran_file_width = NULL,
    rariran_file_height = NULL,
    rariran_file_created_at = NULL,
    rariran_file_updated_at = NULL,
    rariran_file_mimetype = NULL,
    rariran_file_extension = NULL,
    rariran_file_size = NULL,
    rariran_file_filename = NULL,
    rariran_file_thumbnail = NULL,
    rariran_file_raw_json = NULL
WHERE media_type = 'video'
  AND rariran_file_id IS NOT NULL
  AND rariran_file_mimetype ILIKE 'image/%'
  AND rariran_static_file_id IS NULL;
