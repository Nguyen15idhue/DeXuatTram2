CREATE TABLE IF NOT EXISTS charging_station_commitments (
  id INT NOT NULL AUTO_INCREMENT,
  charging_station_id INT NOT NULL,
  model VARCHAR(40) NOT NULL,
  supplier_id INT NOT NULL,
  pole_id INT NOT NULL,
  quantity INT NOT NULL,
  source_key VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_station_commitment_source (charging_station_id, source_key),
  KEY idx_station_commitment_pole_supplier (charging_station_id, supplier_id, pole_id),
  CONSTRAINT fk_station_commitment_station FOREIGN KEY (charging_station_id) REFERENCES charging_stations (id) ON DELETE CASCADE,
  CONSTRAINT fk_station_commitment_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_station_commitment_pole FOREIGN KEY (pole_id) REFERENCES charging_poles (id) ON DELETE RESTRICT,
  CONSTRAINT chk_station_commitment_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS charging_station_deployments (
  id BIGINT NOT NULL AUTO_INCREMENT,
  charging_station_id INT NOT NULL,
  export_item_id INT NOT NULL,
  quantity INT NOT NULL,
  stage ENUM('INSTALLING','ACCEPTANCE','CONFIGURING','OPERATING') NOT NULL DEFAULT 'INSTALLING',
  sub_status VARCHAR(30) NULL,
  acceptance_file_id INT NULL,
  acceptance_date DATE NULL,
  on_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_station_deployments_station (charging_station_id, stage, id),
  KEY idx_station_deployments_export_item (export_item_id),
  CONSTRAINT fk_station_deployment_station FOREIGN KEY (charging_station_id) REFERENCES charging_stations (id) ON DELETE CASCADE,
  CONSTRAINT fk_station_deployment_export_item FOREIGN KEY (export_item_id) REFERENCES warehouse_export_items (id) ON DELETE RESTRICT,
  CONSTRAINT fk_station_deployment_acceptance_file FOREIGN KEY (acceptance_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT chk_station_deployment_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS charging_station_fulfillment_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  charging_station_id INT NOT NULL,
  request_id VARCHAR(100) NOT NULL,
  operation VARCHAR(40) NOT NULL,
  actor_id INT NULL,
  payload JSON NOT NULL,
  result JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_station_fulfillment_request (charging_station_id, request_id),
  KEY idx_station_fulfillment_operation (charging_station_id, operation, created_at),
  CONSTRAINT fk_station_fulfillment_station FOREIGN KEY (charging_station_id) REFERENCES charging_stations (id) ON DELETE CASCADE,
  CONSTRAINT fk_station_fulfillment_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_fulfillment_review_required = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'fulfillment_review_required'
);
SET @sql_fulfillment_review_required = IF(@has_fulfillment_review_required = 0,
  'ALTER TABLE charging_stations ADD COLUMN fulfillment_review_required TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''Legacy fulfillment requires manual review''',
  'SELECT 1');
PREPARE stmt_fulfillment_review_required FROM @sql_fulfillment_review_required;
EXECUTE stmt_fulfillment_review_required;
DEALLOCATE PREPARE stmt_fulfillment_review_required;

SET @has_export_commitment_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items' AND COLUMN_NAME = 'commitment_id'
);
SET @sql_export_commitment_id = IF(@has_export_commitment_id = 0,
  'ALTER TABLE warehouse_export_items ADD COLUMN commitment_id INT NULL COMMENT ''Committed station trụ line''',
  'SELECT 1');
PREPARE stmt_export_commitment_id FROM @sql_export_commitment_id;
EXECUTE stmt_export_commitment_id;
DEALLOCATE PREPARE stmt_export_commitment_id;

SET @has_received_quantity = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items' AND COLUMN_NAME = 'received_quantity'
);
SET @sql_received_quantity = IF(@has_received_quantity = 0,
  'ALTER TABLE warehouse_export_items ADD COLUMN received_quantity INT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt_received_quantity FROM @sql_received_quantity;
EXECUTE stmt_received_quantity;
DEALLOCATE PREPARE stmt_received_quantity;

SET @has_return_pending_quantity = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items' AND COLUMN_NAME = 'return_pending_quantity'
);
SET @sql_return_pending_quantity = IF(@has_return_pending_quantity = 0,
  'ALTER TABLE warehouse_export_items ADD COLUMN return_pending_quantity INT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt_return_pending_quantity FROM @sql_return_pending_quantity;
EXECUTE stmt_return_pending_quantity;
DEALLOCATE PREPARE stmt_return_pending_quantity;

SET @has_returned_quantity = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items' AND COLUMN_NAME = 'returned_quantity'
);
SET @sql_returned_quantity = IF(@has_returned_quantity = 0,
  'ALTER TABLE warehouse_export_items ADD COLUMN returned_quantity INT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt_returned_quantity FROM @sql_returned_quantity;
EXECUTE stmt_returned_quantity;
DEALLOCATE PREPARE stmt_returned_quantity;

SET @has_commitment_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items' AND INDEX_NAME = 'idx_wei_commitment'
);
SET @sql_commitment_index = IF(@has_commitment_index = 0,
  'ALTER TABLE warehouse_export_items ADD INDEX idx_wei_commitment (commitment_id)',
  'SELECT 1');
PREPARE stmt_commitment_index FROM @sql_commitment_index;
EXECUTE stmt_commitment_index;
DEALLOCATE PREPARE stmt_commitment_index;

SET @has_commitment_fk = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items' AND CONSTRAINT_NAME = 'fk_wei_commitment'
);
SET @sql_commitment_fk = IF(@has_commitment_fk = 0,
  'ALTER TABLE warehouse_export_items ADD CONSTRAINT fk_wei_commitment FOREIGN KEY (commitment_id) REFERENCES charging_station_commitments (id) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE stmt_commitment_fk FROM @sql_commitment_fk;
EXECUTE stmt_commitment_fk;
DEALLOCATE PREPARE stmt_commitment_fk;

INSERT IGNORE INTO charging_station_commitments
  (charging_station_id, model, supplier_id, pole_id, quantity, source_key)
SELECT cs.id,
       COALESCE(NULLIF(TRIM(j.model), ''), NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu'))), '')),
       MIN(scp.supplier_id),
       MIN(cp.id),
       j.quantity,
       LEFT(COALESCE(NULLIF(TRIM(j.source_key) COLLATE utf8mb4_unicode_ci, ''),
                     NULLIF(TRIM(j.legacy_id) COLLATE utf8mb4_unicode_ci, ''),
                     CONCAT('line:', j.ordinal) COLLATE utf8mb4_unicode_ci), 100)
FROM charging_stations cs
JOIN station_proposals p ON p.id = cs.proposal_id
JOIN JSON_TABLE(
  CASE WHEN JSON_VALID(p.chot_so_luong_tru) THEN p.chot_so_luong_tru ELSE JSON_ARRAY() END,
  '$[*]' COLUMNS (
    ordinal FOR ORDINALITY,
    source_key VARCHAR(100) PATH '$.source_key' NULL ON EMPTY,
    legacy_id VARCHAR(100) PATH '$.id' NULL ON EMPTY,
    model VARCHAR(40) PATH '$.mo_hinh' NULL ON EMPTY,
    supplier_id INT PATH '$.supplier_id' NULL ON EMPTY,
    pole_id INT PATH '$.pole_id' NULL ON EMPTY,
    pole_name VARCHAR(255) PATH '$.loai_tru' NULL ON EMPTY,
    quantity INT PATH '$.so_luong' NULL ON EMPTY
  )
) AS j
JOIN charging_poles cp
  ON (j.pole_id IS NOT NULL AND cp.id = j.pole_id)
  OR (j.pole_id IS NULL
      AND LOWER(TRIM(cp.name) COLLATE utf8mb4_unicode_ci)
        = LOWER(TRIM(j.pole_name) COLLATE utf8mb4_unicode_ci))
JOIN supplier_charging_poles scp
  ON scp.charging_pole_id = cp.id AND (j.supplier_id IS NULL OR scp.supplier_id = j.supplier_id)
WHERE j.quantity > 0
  AND COALESCE(NULLIF(TRIM(j.model), ''), NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu'))), '')) IN ('NQ','TDT','LK','NQ_LK')
  AND (j.model IS NOT NULL OR JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu')) <> 'NQ_LK')
GROUP BY cs.id, COALESCE(NULLIF(TRIM(j.model), ''), NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu'))), '')),
         j.quantity,
         LEFT(COALESCE(NULLIF(TRIM(j.source_key) COLLATE utf8mb4_unicode_ci, ''),
                       NULLIF(TRIM(j.legacy_id) COLLATE utf8mb4_unicode_ci, ''),
                       CONCAT('line:', j.ordinal) COLLATE utf8mb4_unicode_ci), 100)
HAVING COUNT(DISTINCT cp.id) = 1 AND COUNT(DISTINCT scp.supplier_id) = 1;

UPDATE charging_stations cs
JOIN station_proposals p ON p.id = cs.proposal_id
SET cs.fulfillment_review_required = 1
WHERE p.chot_so_luong_tru IS NOT NULL
  AND (
    JSON_TYPE(p.chot_so_luong_tru) <> 'ARRAY'
    OR JSON_LENGTH(p.chot_so_luong_tru) <> (
      SELECT COUNT(*) FROM charging_station_commitments c WHERE c.charging_station_id = cs.id
    )
  );

UPDATE warehouse_export_items wei
JOIN warehouse_exports we ON we.id = wei.export_id AND we.destination_type = 'STATION'
JOIN (
  SELECT wei2.id AS export_item_id, MIN(c.id) AS commitment_id
  FROM warehouse_export_items wei2
  JOIN warehouse_exports we2 ON we2.id = wei2.export_id AND we2.destination_type = 'STATION'
  JOIN charging_station_commitments c
    ON c.charging_station_id = we2.charging_station_id
   AND c.supplier_id = wei2.supplier_id
   AND c.pole_id = wei2.pole_id
  GROUP BY wei2.id
  HAVING COUNT(c.id) = 1
) AS mapping ON mapping.export_item_id = wei.id
SET wei.commitment_id = mapping.commitment_id,
    wei.received_quantity = CASE WHEN we.transport_status = 'DELIVERED' THEN wei.quantity ELSE 0 END
WHERE wei.commitment_id IS NULL;

UPDATE charging_stations cs
SET cs.fulfillment_review_required = 1
WHERE EXISTS (
  SELECT 1
  FROM warehouse_exports we
  JOIN warehouse_export_items wei ON wei.export_id = we.id
  WHERE we.charging_station_id = cs.id
    AND we.destination_type = 'STATION'
    AND wei.commitment_id IS NULL
)
OR EXISTS (
  SELECT 1
  FROM warehouse_exports we
  JOIN warehouse_export_items wei ON wei.export_id = we.id
  WHERE we.charging_station_id = cs.id
    AND we.destination_type = 'STATION'
    AND we.transport_status = 'DELIVERED'
    AND wei.received_quantity > 0
    AND cs.status NOT IN ('INSTALLING','ACCEPTANCE','CONFIGURING','OPERATING')
);

INSERT INTO charging_station_deployments
  (charging_station_id, export_item_id, quantity, stage, sub_status,
   acceptance_file_id, acceptance_date, on_date)
SELECT we.charging_station_id,
       wei.id,
       wei.received_quantity,
       CASE
         WHEN cs.status = 'INSTALLING' AND cs.sub_status = 'INSTALLED' THEN 'ACCEPTANCE'
         WHEN cs.status = 'ACCEPTANCE' AND cs.sub_status = 'ACCEPT_PASSED' THEN 'CONFIGURING'
         WHEN cs.status = 'CONFIGURING' THEN 'CONFIGURING'
         WHEN cs.status = 'OPERATING' AND cs.sub_status = 'CONFIGURING' THEN 'CONFIGURING'
         WHEN cs.status = 'OPERATING' THEN 'OPERATING'
         WHEN cs.status = 'ACCEPTANCE' THEN 'ACCEPTANCE'
         ELSE 'INSTALLING'
       END,
       CASE
         WHEN cs.status = 'INSTALLING' AND cs.sub_status = 'INSTALLED' THEN 'NOT_ACCEPTED'
         WHEN cs.status = 'INSTALLING' AND cs.sub_status = 'INSTALLING' THEN 'INSTALLING'
         WHEN cs.status = 'ACCEPTANCE' AND cs.sub_status = 'ACCEPT_PASSED' THEN 'NOT_CONFIGURED'
         WHEN cs.status = 'ACCEPTANCE' AND cs.sub_status = 'ACCEPT_FAILED' THEN 'ACCEPT_FAILED'
         WHEN cs.status = 'ACCEPTANCE' THEN 'NOT_ACCEPTED'
         WHEN cs.status IN ('CONFIGURING') OR (cs.status = 'OPERATING' AND cs.sub_status = 'CONFIGURING') THEN 'NOT_CONFIGURED'
         WHEN cs.status = 'OPERATING' THEN 'ACTIVE'
         WHEN cs.sub_status = 'INSTALLING' THEN 'INSTALLING'
         ELSE 'NOT_INSTALLED'
       END,
       cs.acceptance_file_id,
       cs.acceptance_date,
       cs.on_date
FROM warehouse_export_items wei
JOIN warehouse_exports we ON we.id = wei.export_id
JOIN charging_stations cs ON cs.id = we.charging_station_id
WHERE we.destination_type = 'STATION'
  AND wei.commitment_id IS NOT NULL
  AND wei.received_quantity > 0
  AND cs.status IN ('INSTALLING','ACCEPTANCE','CONFIGURING','OPERATING')
  AND NOT EXISTS (
    SELECT 1 FROM charging_station_deployments d WHERE d.export_item_id = wei.id
  );
