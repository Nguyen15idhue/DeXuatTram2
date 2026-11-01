-- Add display_format and unit columns to field_definitions
-- Date: 2026-09-01
-- Idempotent: chỉ thêm cột khi chưa tồn tại.

SET @has_display_format := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'field_definitions' AND COLUMN_NAME = 'display_format'
);
SET @display_format_sql := IF(
  @has_display_format = 0,
  'ALTER TABLE field_definitions ADD COLUMN display_format VARCHAR(20) DEFAULT ''plain'' AFTER decimal_places',
  'SELECT ''display_format already exists'' AS info'
);
PREPARE stmt_display_format FROM @display_format_sql;
EXECUTE stmt_display_format;
DEALLOCATE PREPARE stmt_display_format;

SET @has_unit := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'field_definitions' AND COLUMN_NAME = 'unit'
);
SET @unit_sql := IF(
  @has_unit = 0,
  'ALTER TABLE field_definitions ADD COLUMN unit VARCHAR(50) DEFAULT NULL AFTER display_format',
  'SELECT ''unit already exists'' AS info'
);
PREPARE stmt_unit FROM @unit_sql;
EXECUTE stmt_unit;
DEALLOCATE PREPARE stmt_unit;
