-- 210: Hang doi dong bo proposal sang Google Sheets va luot dong bo thu cong.
-- Trigger tao outbox trong cung transaction voi thay doi station_proposals.

CREATE TABLE IF NOT EXISTS proposal_sheet_sync_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trigger_type ENUM('DAILY_MANUAL') NOT NULL,
  status ENUM('QUEUED','RUNNING','SUCCESS','FAILED') NOT NULL DEFAULT 'QUEUED',
  triggered_by INT NULL,
  date_from DATETIME NOT NULL,
  date_to DATETIME NOT NULL,
  total_count INT UNSIGNED NOT NULL DEFAULT 0,
  synced_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_proposal_sheet_runs_status (status, created_at),
  CONSTRAINT fk_proposal_sheet_runs_user FOREIGN KEY (triggered_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proposal_sheet_sync_queue (
  proposal_id INT NOT NULL PRIMARY KEY,
  operation ENUM('UPSERT','DELETE') NOT NULL DEFAULT 'UPSERT',
  requested_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  synced_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('PENDING','PROCESSING','DONE','FAILED') NOT NULL DEFAULT 'PENDING',
  attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NULL,
  manual_run_id BIGINT UNSIGNED NULL,
  last_error TEXT NULL,
  last_synced_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_proposal_sheet_queue_work (status, next_attempt_at, updated_at),
  KEY idx_proposal_sheet_queue_run (manual_run_id, status),
  CONSTRAINT fk_proposal_sheet_queue_run FOREIGN KEY (manual_run_id) REFERENCES proposal_sheet_sync_runs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_proposal_sheet_sync_insert;
CREATE TRIGGER trg_proposal_sheet_sync_insert
AFTER INSERT ON station_proposals
FOR EACH ROW
  INSERT INTO proposal_sheet_sync_queue
    (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
  VALUES (NEW.id, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
  ON DUPLICATE KEY UPDATE
    requested_version = requested_version + 1,
    operation = 'UPSERT',
    status = IF(status = 'PROCESSING', 'PROCESSING', 'PENDING'),
    attempt_count = IF(status = 'PROCESSING', attempt_count, 0),
    next_attempt_at = NOW(),
    last_error = NULL,
    updated_at = NOW();

DROP TRIGGER IF EXISTS trg_proposal_sheet_sync_update;
CREATE TRIGGER trg_proposal_sheet_sync_update
AFTER UPDATE ON station_proposals
FOR EACH ROW
  INSERT INTO proposal_sheet_sync_queue
    (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
  VALUES (NEW.id, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
  ON DUPLICATE KEY UPDATE
    requested_version = requested_version + 1,
    operation = 'UPSERT',
    status = IF(status = 'PROCESSING', 'PROCESSING', 'PENDING'),
    attempt_count = IF(status = 'PROCESSING', attempt_count, 0),
    next_attempt_at = NOW(),
    last_error = NULL,
    updated_at = NOW();

DROP TRIGGER IF EXISTS trg_proposal_sheet_sync_delete;
CREATE TRIGGER trg_proposal_sheet_sync_delete
AFTER DELETE ON station_proposals
FOR EACH ROW
  INSERT INTO proposal_sheet_sync_queue
    (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
  VALUES (OLD.id, 'DELETE', 1, 0, 'PENDING', 0, NOW())
  ON DUPLICATE KEY UPDATE
    requested_version = requested_version + 1,
    operation = 'DELETE',
    status = IF(status = 'PROCESSING', 'PROCESSING', 'PENDING'),
    attempt_count = IF(status = 'PROCESSING', attempt_count, 0),
    next_attempt_at = NOW(),
    last_error = NULL,
    updated_at = NOW();
