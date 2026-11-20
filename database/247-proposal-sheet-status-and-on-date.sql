CREATE TABLE IF NOT EXISTS proposal_status_change_times (
  proposal_id INT NOT NULL PRIMARY KEY,
  status VARCHAR(50) NULL,
  changed_at DATETIME NOT NULL,
  CONSTRAINT fk_proposal_status_change_times_proposal
    FOREIGN KEY (proposal_id) REFERENCES station_proposals (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_proposal_status_time_insert;
DELIMITER $$
CREATE TRIGGER trg_proposal_status_time_insert
AFTER INSERT ON station_proposals
FOR EACH ROW
BEGIN
  INSERT INTO proposal_status_change_times (proposal_id, status, changed_at)
  VALUES (NEW.id, NEW.status, COALESCE(NEW.created_at, NOW()));
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_proposal_status_time_update;
DELIMITER $$
CREATE TRIGGER trg_proposal_status_time_update
AFTER UPDATE ON station_proposals
FOR EACH ROW
BEGIN
  IF NOT (OLD.status <=> NEW.status) THEN
    INSERT INTO proposal_status_change_times (proposal_id, status, changed_at)
    VALUES (NEW.id, NEW.status, NOW())
    ON DUPLICATE KEY UPDATE status = VALUES(status), changed_at = VALUES(changed_at);
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_proposal_sheet_on_insert;
DELIMITER $$
CREATE TRIGGER trg_proposal_sheet_on_insert
AFTER INSERT ON charging_stations
FOR EACH ROW
BEGIN
  IF NEW.on_date IS NOT NULL THEN
    INSERT INTO proposal_sheet_sync_queue
      (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
    VALUES (NEW.proposal_id, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
    ON DUPLICATE KEY UPDATE requested_version = proposal_sheet_sync_queue.requested_version + 1,
      operation = 'UPSERT', status = IF(proposal_sheet_sync_queue.status = 'PROCESSING', 'PROCESSING', 'PENDING'),
      attempt_count = IF(proposal_sheet_sync_queue.status = 'PROCESSING', proposal_sheet_sync_queue.attempt_count, 0),
      next_attempt_at = NOW(), last_error = NULL, updated_at = NOW();
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_proposal_sheet_on_update;
DELIMITER $$
CREATE TRIGGER trg_proposal_sheet_on_update
AFTER UPDATE ON charging_stations
FOR EACH ROW
BEGIN
  IF NOT (OLD.on_date <=> NEW.on_date) OR NOT (OLD.proposal_id <=> NEW.proposal_id) THEN
    INSERT INTO proposal_sheet_sync_queue
      (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
    SELECT p.id, 'UPSERT', 1, 0, 'PENDING', 0, NOW()
      FROM station_proposals p WHERE p.id IN (OLD.proposal_id, NEW.proposal_id)
    ON DUPLICATE KEY UPDATE requested_version = proposal_sheet_sync_queue.requested_version + 1,
      operation = 'UPSERT', status = IF(proposal_sheet_sync_queue.status = 'PROCESSING', 'PROCESSING', 'PENDING'),
      attempt_count = IF(proposal_sheet_sync_queue.status = 'PROCESSING', proposal_sheet_sync_queue.attempt_count, 0),
      next_attempt_at = NOW(), last_error = NULL, updated_at = NOW();
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_proposal_sheet_on_delete;
DELIMITER $$
CREATE TRIGGER trg_proposal_sheet_on_delete
AFTER DELETE ON charging_stations
FOR EACH ROW
BEGIN
  IF OLD.on_date IS NOT NULL THEN
    INSERT INTO proposal_sheet_sync_queue
      (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
    SELECT p.id, 'UPSERT', 1, 0, 'PENDING', 0, NOW()
      FROM station_proposals p WHERE p.id = OLD.proposal_id
    ON DUPLICATE KEY UPDATE requested_version = proposal_sheet_sync_queue.requested_version + 1,
      operation = 'UPSERT', status = IF(proposal_sheet_sync_queue.status = 'PROCESSING', 'PROCESSING', 'PENDING'),
      attempt_count = IF(proposal_sheet_sync_queue.status = 'PROCESSING', proposal_sheet_sync_queue.attempt_count, 0),
      next_attempt_at = NOW(), last_error = NULL, updated_at = NOW();
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_proposal_sheet_user_update;
DELIMITER $$
CREATE TRIGGER trg_proposal_sheet_user_update
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  IF NOT (OLD.full_name <=> NEW.full_name)
     OR NOT (OLD.parent_id <=> NEW.parent_id)
     OR NOT (JSON_EXTRACT(OLD.custom_data, '$.department') <=> JSON_EXTRACT(NEW.custom_data, '$.department'))
     OR NOT (JSON_EXTRACT(OLD.custom_data, '$.chuc_vu') <=> JSON_EXTRACT(NEW.custom_data, '$.chuc_vu')) THEN
    INSERT INTO proposal_sheet_sync_queue
      (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
    SELECT p.id, 'UPSERT', 1, 0, 'PENDING', 0, NOW()
      FROM station_proposals p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN users parent ON parent.id = u.parent_id
     WHERE p.user_id = NEW.id OR u.parent_id = NEW.id OR parent.parent_id = NEW.id
    ON DUPLICATE KEY UPDATE requested_version = proposal_sheet_sync_queue.requested_version + 1,
      operation = 'UPSERT', status = IF(proposal_sheet_sync_queue.status = 'PROCESSING', 'PROCESSING', 'PENDING'),
      attempt_count = IF(proposal_sheet_sync_queue.status = 'PROCESSING', proposal_sheet_sync_queue.attempt_count, 0),
      next_attempt_at = NOW(), last_error = NULL, updated_at = NOW();
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_proposal_sheet_user_delete;
DELIMITER $$
CREATE TRIGGER trg_proposal_sheet_user_delete
BEFORE DELETE ON users
FOR EACH ROW
BEGIN
  INSERT INTO proposal_sheet_sync_queue
    (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
  SELECT p.id, 'UPSERT', 1, 0, 'PENDING', 0, NOW()
    FROM station_proposals p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN users parent ON parent.id = u.parent_id
   WHERE p.user_id = OLD.id OR u.parent_id = OLD.id OR parent.parent_id = OLD.id
  ON DUPLICATE KEY UPDATE requested_version = proposal_sheet_sync_queue.requested_version + 1,
    operation = 'UPSERT', status = IF(proposal_sheet_sync_queue.status = 'PROCESSING', 'PROCESSING', 'PENDING'),
    attempt_count = IF(proposal_sheet_sync_queue.status = 'PROCESSING', proposal_sheet_sync_queue.attempt_count, 0),
    next_attempt_at = NOW(), last_error = NULL, updated_at = NOW();
END$$
DELIMITER ;
