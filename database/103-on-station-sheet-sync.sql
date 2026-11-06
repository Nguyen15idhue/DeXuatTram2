-- 103-on-station-sheet-sync.sql
-- Đồng bộ Google Sheet riêng cho trạm đã ON (proposal status = ACTIVE).

CREATE TABLE IF NOT EXISTS on_station_sheet_sync_queue (
  proposal_id int NOT NULL,
  operation enum('UPSERT','DELETE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UPSERT',
  requested_version bigint unsigned NOT NULL DEFAULT '1',
  synced_version bigint unsigned NOT NULL DEFAULT '0',
  status enum('PENDING','PROCESSING','DONE','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  attempt_count smallint unsigned NOT NULL DEFAULT '0',
  next_attempt_at datetime DEFAULT NULL,
  manual_run_id bigint unsigned DEFAULT NULL,
  last_error text COLLATE utf8mb4_unicode_ci,
  last_synced_at datetime DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (proposal_id),
  KEY idx_on_station_sheet_queue_work (status,next_attempt_at,updated_at),
  KEY idx_on_station_sheet_queue_run (manual_run_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trigger: enqueue khi proposal chuyển sang ACTIVE
DROP TRIGGER IF EXISTS trg_on_station_sheet_sync_active;
DELIMITER $$
CREATE TRIGGER trg_on_station_sheet_sync_active
AFTER UPDATE ON station_proposals
FOR EACH ROW
BEGIN
  IF NEW.status = 'ACTIVE' AND (OLD.status IS NULL OR OLD.status <> 'ACTIVE') THEN
    INSERT INTO on_station_sheet_sync_queue
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
  END IF;
  -- Nếu proposal ACTIVE bị xóa/hủy → delete row
  IF OLD.status = 'ACTIVE' AND NEW.status <> 'ACTIVE' AND NEW.status IN ('CANCELLED','ARCHIVED') THEN
    INSERT INTO on_station_sheet_sync_queue
      (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
    VALUES (NEW.id, 'DELETE', 1, 0, 'PENDING', 0, NOW())
    ON DUPLICATE KEY UPDATE
      requested_version = requested_version + 1,
      operation = 'DELETE',
      status = IF(status = 'PROCESSING', 'PROCESSING', 'PENDING'),
      attempt_count = IF(status = 'PROCESSING', attempt_count, 0),
      next_attempt_at = NOW(),
      last_error = NULL,
      updated_at = NOW();
  END IF;
END$$
DELIMITER ;

-- Trigger: enqueue on insert if already ACTIVE (edge case)
DROP TRIGGER IF EXISTS trg_on_station_sheet_sync_insert;
DELIMITER $$
CREATE TRIGGER trg_on_station_sheet_sync_insert
AFTER INSERT ON station_proposals
FOR EACH ROW
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    INSERT INTO on_station_sheet_sync_queue
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
  END IF;
END$$
DELIMITER ;

-- Trigger: enqueue on delete
DROP TRIGGER IF EXISTS trg_on_station_sheet_sync_delete;
DELIMITER $$
CREATE TRIGGER trg_on_station_sheet_sync_delete
AFTER DELETE ON station_proposals
FOR EACH ROW
BEGIN
  IF OLD.status = 'ACTIVE' THEN
    INSERT INTO on_station_sheet_sync_queue
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
  END IF;
END$$
DELIMITER ;
