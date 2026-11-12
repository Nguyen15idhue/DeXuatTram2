SET @columns_sql = (
  SELECT GROUP_CONCAT(definition SEPARATOR ', ')
  FROM (
    SELECT 'infra_power_date' AS name, 'ADD COLUMN infra_power_date DATE NULL' AS definition
    UNION ALL SELECT 'infra_power_note', 'ADD COLUMN infra_power_note TEXT NULL'
    UNION ALL SELECT 'infra_site_date', 'ADD COLUMN infra_site_date DATE NULL'
    UNION ALL SELECT 'infra_site_note', 'ADD COLUMN infra_site_note TEXT NULL'
  ) additions
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = 'charging_stations'
      AND c.COLUMN_NAME = additions.name
  )
);
SET @sql = IF(@columns_sql IS NULL, 'SELECT 1', CONCAT('ALTER TABLE charging_stations ', @columns_sql));
PREPARE infrastructure_details_stmt FROM @sql;
EXECUTE infrastructure_details_stmt;
DEALLOCATE PREPARE infrastructure_details_stmt;
