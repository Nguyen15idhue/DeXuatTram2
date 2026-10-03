-- 120: Cot ma tram cho tren de xuat (ke hoach 65)
-- Cap khi duyet chu truong, giu khi huy/tu choi, dung khi tao tram luc ky thanh cong.
-- Idempotent.

SET @has_pending := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'pending_station_code'
);
SET @sql_pending := IF(@has_pending = 0,
  'ALTER TABLE station_proposals ADD COLUMN pending_station_code VARCHAR(50) NULL UNIQUE',
  'SELECT ''pending_station_code already exists'' AS info');
PREPARE stmt_pending FROM @sql_pending;
EXECUTE stmt_pending;
DEALLOCATE PREPARE stmt_pending;
