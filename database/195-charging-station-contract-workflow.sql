-- Add a dedicated contract workflow for charging stations.

ALTER TABLE charging_stations
  MODIFY COLUMN contract_status ENUM('NOT', 'DOING', 'DONE', 'CANCELLED') NULL DEFAULT 'NOT';

SET @contract_file_column_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'charging_stations'
     AND COLUMN_NAME = 'contract_file_id'
);
SET @contract_file_column_sql = IF(
  @contract_file_column_exists = 0,
  'ALTER TABLE charging_stations ADD COLUMN contract_file_id INT NULL AFTER contract_status',
  'SELECT 1'
);
PREPARE stmt_contract_file_column FROM @contract_file_column_sql;
EXECUTE stmt_contract_file_column;
DEALLOCATE PREPARE stmt_contract_file_column;

SET @contract_file_fk_exists = (
  SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'charging_stations'
     AND CONSTRAINT_NAME = 'fk_charging_stations_contract_file'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @contract_file_fk_sql = IF(
  @contract_file_fk_exists = 0,
  'ALTER TABLE charging_stations ADD CONSTRAINT fk_charging_stations_contract_file FOREIGN KEY (contract_file_id) REFERENCES files (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_contract_file_fk FROM @contract_file_fk_sql;
EXECUTE stmt_contract_file_fk;
DEALLOCATE PREPARE stmt_contract_file_fk;

SET @contract_status_index_exists = (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'charging_stations'
     AND INDEX_NAME = 'idx_charging_stations_contract_status'
);
SET @contract_status_index_sql = IF(
  @contract_status_index_exists = 0,
  'CREATE INDEX idx_charging_stations_contract_status ON charging_stations (contract_status, status, updated_at)',
  'SELECT 1'
);
PREPARE stmt_contract_status_index FROM @contract_status_index_sql;
EXECUTE stmt_contract_status_index;
DEALLOCATE PREPARE stmt_contract_status_index;
