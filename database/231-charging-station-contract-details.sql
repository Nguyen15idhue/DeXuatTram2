SET @columns_sql = (
  SELECT GROUP_CONCAT(definition SEPARATOR ', ')
  FROM (
    SELECT 'contract_effective_date' AS name, 'ADD COLUMN contract_effective_date DATE NULL' AS definition
    UNION ALL SELECT 'contract_expiry_date', 'ADD COLUMN contract_expiry_date DATE NULL'
    UNION ALL SELECT 'contract_note', 'ADD COLUMN contract_note TEXT NULL'
  ) additions
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = 'charging_stations'
      AND c.COLUMN_NAME = additions.name
  )
);
SET @sql = IF(@columns_sql IS NULL, 'SELECT 1', CONCAT('ALTER TABLE charging_stations ', @columns_sql));
PREPARE contract_details_stmt FROM @sql;
EXECUTE contract_details_stmt;
DEALLOCATE PREPARE contract_details_stmt;

CREATE TABLE IF NOT EXISTS charging_station_contract_files (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  charging_station_id INT NOT NULL,
  file_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_station_contract_file (charging_station_id, file_id),
  CONSTRAINT fk_station_contract_files_station FOREIGN KEY (charging_station_id)
    REFERENCES charging_stations(id) ON DELETE CASCADE,
  CONSTRAINT fk_station_contract_files_file FOREIGN KEY (file_id)
    REFERENCES files(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO charging_station_contract_files (charging_station_id, file_id, sort_order)
SELECT cs.id, cs.contract_file_id, 0
FROM charging_stations cs
JOIN files f ON f.id = cs.contract_file_id
WHERE NOT EXISTS (
  SELECT 1 FROM charging_station_contract_files cf
  WHERE cf.charging_station_id = cs.id AND cf.file_id = cs.contract_file_id
);
