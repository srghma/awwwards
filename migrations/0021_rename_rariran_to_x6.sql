DO $$
DECLARE
  rec RECORD;
  old_col TEXT;
  new_col TEXT;
BEGIN
  -- Sites table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sites' AND column_name='rariran_content_id') THEN
    UPDATE sites SET x6_content_id = rariran_content_id WHERE x6_content_id IS NULL AND rariran_content_id IS NOT NULL;
    UPDATE sites SET x6_content_slug = rariran_content_slug WHERE x6_content_slug IS NULL AND rariran_content_slug IS NOT NULL;
    UPDATE sites SET x6_content_status = rariran_content_status WHERE x6_content_status IS NULL AND rariran_content_status IS NOT NULL;
    ALTER TABLE sites DROP COLUMN IF EXISTS rariran_content_id;
    ALTER TABLE sites DROP COLUMN IF EXISTS rariran_content_slug;
    ALTER TABLE sites DROP COLUMN IF EXISTS rariran_content_status;
  END IF;

  -- Elements table rariran_* columns
  FOR rec IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'elements' AND column_name LIKE 'rariran_%'
  LOOP
    old_col := rec.column_name;
    new_col := regexp_replace(old_col, '^rariran_', 'x6_');

    IF old_col LIKE 'rariran_content_%' THEN
      new_col := regexp_replace(old_col, '^rariran_content_', 'x6_case_');
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='elements' AND column_name=new_col) THEN
      EXECUTE format('UPDATE elements SET %I = %I WHERE %I IS NULL AND %I IS NOT NULL', new_col, old_col, new_col, old_col);
      EXECUTE format('ALTER TABLE elements DROP COLUMN %I', old_col);
    ELSE
      EXECUTE format('ALTER TABLE elements RENAME COLUMN %I TO %I', old_col, new_col);
    END IF;
  END LOOP;
END $$;
