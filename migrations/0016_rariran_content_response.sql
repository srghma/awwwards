ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_content_status TEXT CHECK (rariran_content_status IS NULL OR length(rariran_content_status) > 0);
ALTER TABLE elements ADD COLUMN IF NOT EXISTS rariran_content_raw_json TEXT CHECK (rariran_content_raw_json IS NULL OR length(rariran_content_raw_json) > 0);
