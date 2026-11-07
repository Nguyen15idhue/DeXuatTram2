-- 217-on-station-sheet-sync-more-triggers.sql
-- Bổ sung trigger để Google Sheet trạm ON luôn cập nhật khi dữ liệu trạm thay đổi,
-- không chỉ khi proposal chuyển trạng thái sang ACTIVE.

-- 1) station_proposals: mọi cập nhật khi status = ACTIVE đều đưa vào hàng đợi UPSERT
DROP TRIGGER IF EXISTS trg_on_station_sheet_sync_active;
DELIMITER $$
CREATE TRIGGER trg_on_station_sheet_sync_active
AFTER UPDATE ON station_proposals
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

  IF OLD.status = 'ACTIVE' AND NEW.status IN ('CANCELLED','ARCHIVED') THEN
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

-- 2) charging_stations: thay đổi thông tin ON trạm (mã trạm, ngày ON...) khi proposal đang ACTIVE
DROP TRIGGER IF EXISTS trg_on_station_sheet_sync_charging_insert;
DELIMITER $$
CREATE TRIGGER trg_on_station_sheet_sync_charging_insert
AFTER INSERT ON charging_stations
FOR EACH ROW
BEGIN
  IF NEW.proposal_id IS NOT NULL
     AND (SELECT status FROM station_proposals WHERE id = NEW.proposal_id) = 'ACTIVE' THEN
    INSERT INTO on_station_sheet_sync_queue
      (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
    VALUES (NEW.proposal_id, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
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

DROP TRIGGER IF EXISTS trg_on_station_sheet_sync_charging_update;
DELIMITER $$
CREATE TRIGGER trg_on_station_sheet_sync_charging_update
AFTER UPDATE ON charging_stations
FOR EACH ROW
BEGIN
  IF NEW.proposal_id IS NOT NULL
     AND (SELECT status FROM station_proposals WHERE id = NEW.proposal_id) = 'ACTIVE' THEN
    INSERT INTO on_station_sheet_sync_queue
      (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
    VALUES (NEW.proposal_id, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
    ON DUPLICATE KEY UPDATE
      requested_version = requested_version + 1,
      operation = 'UPSERT',
      status = IF(status = 'PROCESSING', 'PROCESSING', 'PENDING'),
      attempt_count = IF(status = 'PROCESSING', attempt_count, 0),
      next_attempt_at = NOW(),
      last_error = NULL,
      updated_at = NOW();
  END IF;

  IF OLD.proposal_id IS NOT NULL AND OLD.proposal_id <> NEW.proposal_id
     AND (SELECT status FROM station_proposals WHERE id = OLD.proposal_id) = 'ACTIVE' THEN
    INSERT INTO on_station_sheet_sync_queue
      (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
    VALUES (OLD.proposal_id, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
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
