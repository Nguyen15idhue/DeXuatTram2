-- 137: Journey activity logs, external references, and Proposal journey link.
-- Contract: docs/8/mkt/02-database-contract.md
-- Rollback: drop the added indexes/FK and nullable journey_id column; do not drop logs
-- or external references after they contain production history.
-- Idempotent. Existing proposals remain unlinked with journey_id = NULL.

CREATE TABLE IF NOT EXISTS journey_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  journey_id INT NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id INT NOT NULL,
  action VARCHAR(80) NOT NULL,
  stage_before VARCHAR(30) NULL,
  stage_after VARCHAR(30) NULL,
  status_before VARCHAR(30) NULL,
  status_after VARCHAR(30) NULL,
  changed_fields JSON NULL,
  actor_id INT NULL,
  actor_role VARCHAR(30) NULL,
  source VARCHAR(30) NOT NULL,
  reason TEXT NULL,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_journey_activity_journey_created (journey_id, created_at),
  KEY idx_journey_activity_entity_created (entity_type, entity_id, created_at),
  KEY idx_journey_activity_action_created (action, created_at),
  CONSTRAINT fk_journey_activity_journey FOREIGN KEY (journey_id)
    REFERENCES business_journeys (id) ON DELETE CASCADE,
  CONSTRAINT fk_journey_activity_actor FOREIGN KEY (actor_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journey_external_refs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  journey_id INT NOT NULL,
  `system` VARCHAR(50) NOT NULL,
  ref_type VARCHAR(50) NOT NULL,
  external_id VARCHAR(150) NOT NULL,
  external_code VARCHAR(150) NULL,
  last_synced_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_journey_external_ref (`system`, ref_type, external_id),
  KEY idx_journey_external_refs_journey (journey_id),
  CONSTRAINT fk_journey_external_refs_journey FOREIGN KEY (journey_id)
    REFERENCES business_journeys (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals'
     AND column_name = 'journey_id') = 0,
  'ALTER TABLE station_proposals ADD COLUMN journey_id INT NULL AFTER station_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals'
     AND index_name = 'idx_proposals_journey_created') = 0,
  'ALTER TABLE station_proposals ADD INDEX idx_proposals_journey_created (journey_id, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals'
     AND index_name = 'idx_proposals_journey_status') = 0,
  'ALTER TABLE station_proposals ADD INDEX idx_proposals_journey_status (journey_id, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.referential_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'station_proposals'
     AND constraint_name = 'fk_proposals_journey') = 0,
  'ALTER TABLE station_proposals ADD CONSTRAINT fk_proposals_journey FOREIGN KEY (journey_id) REFERENCES business_journeys (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @duplicate_station_links = (
  SELECT COUNT(*) FROM (
    SELECT station_id FROM station_proposals
    WHERE station_id IS NOT NULL
    GROUP BY station_id HAVING COUNT(*) > 1
  ) AS duplicate_links
);
SET @sql = IF(
  @duplicate_station_links = 0 AND
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals'
     AND index_name = 'uq_proposals_station_id') = 0,
  'ALTER TABLE station_proposals ADD UNIQUE INDEX uq_proposals_station_id (station_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
