SET @has_proposal_status_log_index := (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'proposal_activity_logs'
     AND index_name = 'idx_activity_proposal_status_time'
);
SET @proposal_status_log_index_sql := IF(@has_proposal_status_log_index = 0,
  'CREATE INDEX idx_activity_proposal_status_time ON proposal_activity_logs (proposal_id, action, created_at, id)',
  'SELECT 1');
PREPARE proposal_status_log_index_stmt FROM @proposal_status_log_index_sql;
EXECUTE proposal_status_log_index_stmt;
DEALLOCATE PREPARE proposal_status_log_index_stmt;

DROP TRIGGER IF EXISTS trg_proposal_sheet_status_log_insert;
DELIMITER $$
CREATE TRIGGER trg_proposal_sheet_status_log_insert
AFTER INSERT ON proposal_activity_logs
FOR EACH ROW
BEGIN
  IF NEW.action = 'status_change' AND NOT (NEW.from_status <=> NEW.to_status) THEN
    INSERT INTO proposal_sheet_sync_queue
      (proposal_id, operation, requested_version, synced_version, status, attempt_count, next_attempt_at)
    VALUES (NEW.proposal_id, 'UPSERT', 1, 0, 'PENDING', 0, NOW())
    ON DUPLICATE KEY UPDATE
      requested_version = proposal_sheet_sync_queue.requested_version + 1,
      operation = 'UPSERT',
      status = IF(proposal_sheet_sync_queue.status = 'PROCESSING', 'PROCESSING', 'PENDING'),
      attempt_count = IF(proposal_sheet_sync_queue.status = 'PROCESSING', proposal_sheet_sync_queue.attempt_count, 0),
      next_attempt_at = NOW(), last_error = NULL, updated_at = NOW();
  END IF;
END$$
DELIMITER ;
