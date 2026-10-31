-- 200: Them ghi chu cho danh muc loai tru.
-- Idempotent.

SET @has_note := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_poles' AND COLUMN_NAME = 'note'
);
SET @sql_note := IF(@has_note = 0,
  'ALTER TABLE charging_poles ADD COLUMN note TEXT NULL AFTER supplier',
  'SELECT ''charging_poles.note da ton tai'' AS info');
PREPARE stmt_note FROM @sql_note; EXECUTE stmt_note; DEALLOCATE PREPARE stmt_note;
