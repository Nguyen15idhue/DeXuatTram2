-- 202: ON tram - gia han han 15 ngay (toi da 3 lan x 3 ngay) va trang thai CANCELLED khi qua han.
-- Idempotent, chi tien toi.

SET @status_type = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'status'
);
SET @sql = IF(
  @status_type NOT LIKE '%CANCELLED%',
  'ALTER TABLE charging_stations MODIFY COLUMN status ENUM(''ONBOARDING'',''DELIVERING'',''INSTALLING'',''ACCEPTANCE'',''CONFIGURING'',''OPERATING'',''CANCELLED'') NOT NULL DEFAULT ''ONBOARDING''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'deadline_extension_count'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE charging_stations ADD COLUMN deadline_extension_count TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER finance_deadline_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
