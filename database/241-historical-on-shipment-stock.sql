SET @has_historical_import = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_exports'
    AND COLUMN_NAME = 'historical_import'
);
SET @sql_historical_import = IF(@has_historical_import = 0,
  'ALTER TABLE warehouse_exports ADD COLUMN historical_import TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt_historical_import FROM @sql_historical_import;
EXECUTE stmt_historical_import;
DEALLOCATE PREPARE stmt_historical_import;
