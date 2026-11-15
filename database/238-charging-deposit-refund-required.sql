SET @sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations'
      AND COLUMN_NAME = 'deposit_refund_required'),
  'SELECT 1',
  'ALTER TABLE charging_stations ADD COLUMN deposit_refund_required TINYINT(1) NULL DEFAULT NULL'
);
PREPARE refund_required_stmt FROM @sql;
EXECUTE refund_required_stmt;
DEALLOCATE PREPARE refund_required_stmt;
