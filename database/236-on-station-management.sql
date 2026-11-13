CREATE TABLE IF NOT EXISTS shipping_carriers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  note TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shipping_carrier_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @columns_sql = (
  SELECT GROUP_CONCAT(definition SEPARATOR ', ')
  FROM (
    SELECT 'workflow_override' AS name, 'ADD COLUMN workflow_override JSON NULL' AS definition
  ) additions
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = 'charging_stations' AND c.COLUMN_NAME = additions.name
  )
);
SET @sql = IF(@columns_sql IS NULL, 'SELECT 1', CONCAT('ALTER TABLE charging_stations ', @columns_sql));
PREPARE management_stmt FROM @sql;
EXECUTE management_stmt;
DEALLOCATE PREPARE management_stmt;

SET @columns_sql = (
  SELECT GROUP_CONCAT(definition SEPARATOR ', ')
  FROM (
    SELECT 'installation_status' AS name, 'ADD COLUMN installation_status ENUM(''NOT'',''DOING'',''DONE'') NULL DEFAULT NULL' AS definition
    UNION ALL SELECT 'installation_note', 'ADD COLUMN installation_note TEXT NULL'
    UNION ALL SELECT 'installation_version', 'ADD COLUMN installation_version INT NOT NULL DEFAULT 0'
  ) additions
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = 'charging_station_deployments' AND c.COLUMN_NAME = additions.name
  )
);
SET @sql = IF(@columns_sql IS NULL, 'SELECT 1', CONCAT('ALTER TABLE charging_station_deployments ', @columns_sql));
PREPARE management_stmt FROM @sql;
EXECUTE management_stmt;
DEALLOCATE PREPARE management_stmt;

UPDATE charging_station_deployments
SET installation_status = CASE
  WHEN stage <> 'INSTALLING' THEN 'DONE'
  WHEN sub_status = 'INSTALLING' THEN 'DOING'
  ELSE 'NOT' END
WHERE installation_status IS NULL;
ALTER TABLE charging_station_deployments MODIFY installation_status ENUM('NOT','DOING','DONE') NOT NULL DEFAULT 'NOT';

SET @has_carrier = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_exports' AND COLUMN_NAME = 'carrier_id'
);
SET @sql = IF(@has_carrier = 0,
  'ALTER TABLE warehouse_exports ADD COLUMN carrier_id INT NULL, ADD CONSTRAINT fk_warehouse_export_carrier FOREIGN KEY (carrier_id) REFERENCES shipping_carriers(id) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE management_stmt FROM @sql;
EXECUTE management_stmt;
DEALLOCATE PREPARE management_stmt;
