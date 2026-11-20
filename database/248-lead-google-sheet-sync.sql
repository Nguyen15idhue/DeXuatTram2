CREATE TABLE IF NOT EXISTS lead_sheet_sync_runs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  triggered_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lead_sheet_sync_queue (
  id INT NOT NULL PRIMARY KEY,
  lead_code VARCHAR(50) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('PENDING','DONE','FAILED') NOT NULL DEFAULT 'PENDING',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error VARCHAR(255) NULL,
  run_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_lead_sheet_queue_work (status, next_attempt_at, id),
  KEY idx_lead_sheet_queue_run (run_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TRIGGER IF EXISTS trg_lead_sheet_insert;
CREATE TRIGGER trg_lead_sheet_insert AFTER INSERT ON leads FOR EACH ROW
  INSERT INTO lead_sheet_sync_queue (id, lead_code) VALUES (NEW.id, NEW.lead_code)
  ON DUPLICATE KEY UPDATE lead_code = NEW.lead_code, version = version + 1,
    status = 'PENDING', attempt_count = 0, next_attempt_at = NOW(), last_error = NULL;

DROP TRIGGER IF EXISTS trg_lead_sheet_update;
CREATE TRIGGER trg_lead_sheet_update AFTER UPDATE ON leads FOR EACH ROW
  INSERT INTO lead_sheet_sync_queue (id, lead_code) VALUES (NEW.id, NEW.lead_code)
  ON DUPLICATE KEY UPDATE lead_code = NEW.lead_code, version = version + 1,
    status = 'PENDING', attempt_count = 0, next_attempt_at = NOW(), last_error = NULL;

DROP TRIGGER IF EXISTS trg_lead_sheet_delete;
CREATE TRIGGER trg_lead_sheet_delete AFTER DELETE ON leads FOR EACH ROW
  INSERT INTO lead_sheet_sync_queue (id, lead_code) VALUES (OLD.id, OLD.lead_code)
  ON DUPLICATE KEY UPDATE lead_code = OLD.lead_code, version = version + 1,
    status = 'PENDING', attempt_count = 0, next_attempt_at = NOW(), last_error = NULL;

DROP TRIGGER IF EXISTS trg_lead_sheet_assignee_update;
CREATE TRIGGER trg_lead_sheet_assignee_update AFTER UPDATE ON users FOR EACH ROW
  INSERT INTO lead_sheet_sync_queue (id, lead_code)
  SELECT l.id, l.lead_code FROM leads l
  WHERE l.assigned_user_id = NEW.id AND l.deleted_at IS NULL
    AND (NOT (OLD.full_name <=> NEW.full_name)
      OR NOT (JSON_EXTRACT(OLD.custom_data, '$.department') <=> JSON_EXTRACT(NEW.custom_data, '$.department'))
      OR NOT (JSON_EXTRACT(OLD.custom_data, '$.chuc_vu') <=> JSON_EXTRACT(NEW.custom_data, '$.chuc_vu')))
  ON DUPLICATE KEY UPDATE version = version + 1,
    status = 'PENDING', attempt_count = 0, next_attempt_at = NOW(), last_error = NULL;

DROP TRIGGER IF EXISTS trg_lead_sheet_assignee_delete;
CREATE TRIGGER trg_lead_sheet_assignee_delete BEFORE DELETE ON users FOR EACH ROW
  INSERT INTO lead_sheet_sync_queue (id, lead_code)
  SELECT l.id, l.lead_code FROM leads l WHERE l.assigned_user_id = OLD.id AND l.deleted_at IS NULL
  ON DUPLICATE KEY UPDATE version = version + 1,
    status = 'PENDING', attempt_count = 0, next_attempt_at = NOW(), last_error = NULL;
