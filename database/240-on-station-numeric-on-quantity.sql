SET @has_on_quantity = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_station_deployments' AND COLUMN_NAME = 'on_quantity'
);
SET @sql_on_quantity = IF(@has_on_quantity = 0,
  'ALTER TABLE charging_station_deployments ADD COLUMN on_quantity INT NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt_on_quantity FROM @sql_on_quantity;
EXECUTE stmt_on_quantity;
DEALLOCATE PREPARE stmt_on_quantity;

UPDATE charging_station_deployments
SET on_quantity = CASE WHEN stage = 'OPERATING' THEN quantity ELSE 0 END
WHERE on_quantity IS NULL;

ALTER TABLE charging_station_deployments MODIFY COLUMN on_quantity INT NOT NULL DEFAULT 0;

SET @has_on_quantity_check = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_station_deployments'
    AND CONSTRAINT_NAME = 'chk_deployment_on_quantity'
);
SET @sql_on_quantity_check = IF(@has_on_quantity_check = 0,
  'ALTER TABLE charging_station_deployments ADD CONSTRAINT chk_deployment_on_quantity CHECK (on_quantity >= 0 AND on_quantity <= quantity)',
  'SELECT 1');
PREPARE stmt_on_quantity_check FROM @sql_on_quantity_check;
EXECUTE stmt_on_quantity_check;
DEALLOCATE PREPARE stmt_on_quantity_check;
