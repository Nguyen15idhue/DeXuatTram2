-- Script 46: Them cot system_key vao api_configs de dinh danh he ben ngoai
-- Ngay: 10/09/2026
-- Muc tieu: transform biet dang map he nao (1office, crmB...)

SET @col := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'api_configs' AND column_name = 'system_key');
SET @sql := IF(@col = 0,
  'ALTER TABLE api_configs ADD COLUMN system_key VARCHAR(50) NOT NULL DEFAULT ''1office'' AFTER desc_template_config',
  'SELECT ''Column already exists'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verify
SELECT 'api_configs_system_key' AS tbl, COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'api_configs' AND column_name = 'system_key';
