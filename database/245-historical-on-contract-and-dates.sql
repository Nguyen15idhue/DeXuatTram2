SET @missing_contract_number = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'contract_number'
);
SET @sql_contract_number = IF(@missing_contract_number,
  'ALTER TABLE charging_stations ADD COLUMN contract_number VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt_contract_number FROM @sql_contract_number;
EXECUTE stmt_contract_number;
DEALLOCATE PREPARE stmt_contract_number;

SET @missing_contract_signed_date = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'contract_signed_date'
);
SET @sql_contract_signed_date = IF(@missing_contract_signed_date,
  'ALTER TABLE charging_stations ADD COLUMN contract_signed_date DATE NULL',
  'SELECT 1');
PREPARE stmt_contract_signed_date FROM @sql_contract_signed_date;
EXECUTE stmt_contract_signed_date;
DEALLOCATE PREPARE stmt_contract_signed_date;

SET @export_date_required = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_exports'
    AND COLUMN_NAME = 'export_date' AND IS_NULLABLE = 'NO'
);
SET @sql_export_date = IF(@export_date_required > 0,
  'ALTER TABLE warehouse_exports MODIFY COLUMN export_date DATETIME NULL',
  'SELECT 1');
PREPARE stmt_export_date FROM @sql_export_date;
EXECUTE stmt_export_date;
DEALLOCATE PREPARE stmt_export_date;
