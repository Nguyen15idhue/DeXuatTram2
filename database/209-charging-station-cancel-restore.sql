-- 209: Luu trang thai ON tram va de xuat truoc khi huy thu cong de co the khoi phuc an toan.
-- Idempotent; khong xoa du lieu nghiep vu.

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'manual_cancelled_at'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE charging_stations ADD COLUMN manual_cancelled_at DATETIME NULL AFTER deadline_extension_count',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'manual_cancelled_by'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE charging_stations ADD COLUMN manual_cancelled_by INT NULL AFTER manual_cancelled_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'manual_cancel_snapshot'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE charging_stations ADD COLUMN manual_cancel_snapshot JSON NULL AFTER manual_cancelled_by',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND INDEX_NAME = 'idx_charging_stations_manual_cancel'
);
SET @sql = IF(
  @has_index = 0,
  'CREATE INDEX idx_charging_stations_manual_cancel ON charging_stations (status, manual_cancelled_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
