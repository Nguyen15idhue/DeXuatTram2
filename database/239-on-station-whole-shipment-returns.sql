ALTER TABLE warehouse_exports MODIFY COLUMN transport_status
  ENUM('PENDING','SHIPPING','DELIVERED','FAILED','RETURNED','RETURN_PENDING') NOT NULL DEFAULT 'PENDING';

SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_station_deployments'
      AND COLUMN_NAME = 'returned_at'),
  'SELECT 1',
  'ALTER TABLE charging_station_deployments ADD COLUMN returned_at DATETIME NULL DEFAULT NULL'
);
PREPARE returned_at_stmt FROM @sql;
EXECUTE returned_at_stmt;
DEALLOCATE PREPARE returned_at_stmt;
