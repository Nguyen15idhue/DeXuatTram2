-- Script 39: Thêm selected_fields vào api_configs
-- Mục tiêu: Lưu danh sách proposal fields đã fetch để hiển thị khi reload

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'station_management'
    AND TABLE_NAME = 'api_configs'
    AND COLUMN_NAME = 'selected_fields'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE api_configs ADD COLUMN selected_fields JSON NULL AFTER field_metadata',
  'SELECT ''Column already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'station_management' AND TABLE_NAME = 'api_configs'
AND COLUMN_NAME IN ('field_metadata', 'selected_fields');
