SET @columns_sql = (
  SELECT GROUP_CONCAT(definition SEPARATOR ', ')
  FROM (
    SELECT 'acceptance_status' AS name, 'ADD COLUMN acceptance_status ENUM(''NOT'',''FAILED'',''PASSED'') NULL DEFAULT NULL' AS definition
    UNION ALL SELECT 'acceptance_legacy', 'ADD COLUMN acceptance_legacy TINYINT(1) NOT NULL DEFAULT 0'
    UNION ALL SELECT 'acceptance_user_id', 'ADD COLUMN acceptance_user_id INT NULL'
    UNION ALL SELECT 'on_note', 'ADD COLUMN on_note TEXT NULL'
    UNION ALL SELECT 'workflow_version', 'ADD COLUMN workflow_version INT NOT NULL DEFAULT 0'
  ) additions
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = 'charging_station_deployments' AND c.COLUMN_NAME = additions.name
  )
);
SET @sql = IF(@columns_sql IS NULL, 'SELECT 1', CONCAT('ALTER TABLE charging_station_deployments ', @columns_sql));
PREPARE parallel_stmt FROM @sql;
EXECUTE parallel_stmt;
DEALLOCATE PREPARE parallel_stmt;

UPDATE charging_station_deployments
SET acceptance_legacy = IF(stage IN ('CONFIGURING','OPERATING'), 1, 0),
    acceptance_status = CASE
      WHEN stage IN ('CONFIGURING','OPERATING') THEN 'PASSED'
      WHEN sub_status = 'ACCEPT_FAILED' THEN 'FAILED'
      ELSE 'NOT' END
WHERE acceptance_status IS NULL;
ALTER TABLE charging_station_deployments MODIFY acceptance_status ENUM('NOT','FAILED','PASSED') NOT NULL DEFAULT 'NOT';

CREATE TABLE IF NOT EXISTS charging_station_acceptance_documents (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  deployment_id BIGINT NOT NULL,
  kind ENUM('EQUIPMENT','INFRASTRUCTURE') NOT NULL,
  file_id INT NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_deployment_acceptance_kind (deployment_id, kind),
  CONSTRAINT fk_acceptance_document_deployment FOREIGN KEY (deployment_id) REFERENCES charging_station_deployments(id) ON DELETE CASCADE,
  CONSTRAINT fk_acceptance_document_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS charging_station_acceptance_images (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  acceptance_document_id BIGINT NOT NULL,
  file_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_acceptance_image (acceptance_document_id, file_id),
  CONSTRAINT fk_acceptance_image_document FOREIGN KEY (acceptance_document_id) REFERENCES charging_station_acceptance_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_acceptance_image_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
