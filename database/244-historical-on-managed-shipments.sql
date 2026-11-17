SET @has_historical_import_batch_key = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_exports'
    AND COLUMN_NAME = 'historical_import_batch_key'
);
SET @sql_historical_import_batch_key = IF(@has_historical_import_batch_key = 0,
  'ALTER TABLE warehouse_exports ADD COLUMN historical_import_batch_key VARCHAR(100) NULL',
  'SELECT 1');
PREPARE stmt_historical_import_batch_key FROM @sql_historical_import_batch_key;
EXECUTE stmt_historical_import_batch_key;
DEALLOCATE PREPARE stmt_historical_import_batch_key;

CREATE TABLE IF NOT EXISTS historical_on_import_managed_shipments (
  export_id INT NOT NULL,
  batch_key VARCHAR(100) NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  last_station_activity_id INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (export_id),
  KEY idx_historical_managed_batch (batch_key),
  CONSTRAINT fk_historical_managed_export FOREIGN KEY (export_id)
    REFERENCES warehouse_exports (id) ON DELETE CASCADE,
  CONSTRAINT fk_historical_managed_batch FOREIGN KEY (batch_key)
    REFERENCES historical_on_import_batches (batch_key) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
