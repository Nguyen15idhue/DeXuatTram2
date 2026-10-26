-- 186: Allow proposal edits without committed pole rows.
-- BCĐX upload continues to require at least one valid committed pole row.
-- Idempotent.

UPDATE field_definitions
SET source_config = JSON_SET(
      COALESCE(source_config, JSON_OBJECT()),
      '$.min_rows',
      0
    ),
    required = 0,
    updated_at = NOW()
WHERE entity = 'station_proposals'
  AND `key` = 'chot_so_luong_tru'
  AND type = 'table';
