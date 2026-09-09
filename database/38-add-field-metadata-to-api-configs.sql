-- Script 38: Thêm field_metadata vào api_configs
-- Mục tiêu: Lưu metadata (label, type, options) của1Office fields

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'station_management'
    AND TABLE_NAME = 'api_configs'
    AND COLUMN_NAME = 'field_metadata'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE api_configs ADD COLUMN field_metadata JSON NULL AFTER description',
  'SELECT ''Column already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'station_management'
  AND TABLE_NAME = 'api_configs'
  AND COLUMN_NAME = 'field_metadata';
