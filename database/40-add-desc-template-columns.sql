-- Script 40: Desc Template Engine — Database Migration
-- Ngày: 09/09/2026
-- Phase 7 Bước 7.1: Thêm columns cho desc template

-- ============================================
-- 1. Thêm desc_template_config vào api_configs
-- ============================================
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'station_management'
    AND TABLE_NAME = 'api_configs'
    AND COLUMN_NAME = 'desc_template_config'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE api_configs ADD COLUMN desc_template_config JSON NULL COMMENT ''Cấu hình sections + fields cho desc HTML''',
  'SELECT ''Column desc_template_config already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 2. Thêm used_in_desc vào api_field_mappings
-- ============================================
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'station_management'
    AND TABLE_NAME = 'api_field_mappings'
    AND COLUMN_NAME = 'used_in_desc'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE api_field_mappings ADD COLUMN used_in_desc TINYINT(1) DEFAULT 0 COMMENT ''Field này đã dùng trong desc HTML template''',
  'SELECT ''Column used_in_desc already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 3. Thêm last_synced_data vào station_proposals
-- ============================================
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'station_management'
    AND TABLE_NAME = 'station_proposals'
    AND COLUMN_NAME = 'last_synced_data'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE station_proposals ADD COLUMN last_synced_data JSON NULL COMMENT ''Snapshot data上次 sync để diff''',
  'SELECT ''Column last_synced_data already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 4. KIỂM TRA KẾT QUẢ
-- ============================================
SELECT 'api_configs' AS tbl, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'station_management'
  AND TABLE_NAME = 'api_configs'
  AND COLUMN_NAME = 'desc_template_config';

SELECT 'api_field_mappings' AS tbl, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'station_management'
  AND TABLE_NAME = 'api_field_mappings'
  AND COLUMN_NAME = 'used_in_desc';

SELECT 'station_proposals' AS tbl, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'station_management'
  AND TABLE_NAME = 'station_proposals'
  AND COLUMN_NAME = 'last_synced_data';
