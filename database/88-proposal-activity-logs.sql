-- 88: Nhat ky hoat dong de xuat + webhook inbound (docs/8/46)
-- 1. Bang proposal_activity_logs: moi bien dong de xuat (tao/sua/doi status/tu cho/webhook/auto)
-- 2. Mo rong api_queue_logs.direction them 'inbound' (webhook 1Office goi sang)
-- Idempotent.

CREATE TABLE IF NOT EXISTS proposal_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NULL,
  changed_fields JSON NULL,
  reject_reason TEXT NULL,
  actor_id INT NULL,
  actor_role VARCHAR(30) NULL,
  source ENUM('user','webhook','script','system_auto','admin_override') NOT NULL DEFAULT 'user',
  manual_override TINYINT(1) NOT NULL DEFAULT 0,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_proposal (proposal_id, created_at),
  KEY idx_activity_source (source, created_at),
  CONSTRAINT fk_activity_proposal FOREIGN KEY (proposal_id) REFERENCES station_proposals (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mo rong direction (guard information_schema)
SET @has_inbound := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_queue_logs' AND COLUMN_NAME = 'direction'
    AND COLUMN_TYPE LIKE '%inbound%'
);
SET @sql_dir := IF(@has_inbound = 0,
  'ALTER TABLE api_queue_logs MODIFY COLUMN direction ENUM(''push'',''pull'',''inbound'') NOT NULL DEFAULT ''push''',
  'SELECT ''api_queue_logs.direction already has inbound'' AS info');
PREPARE stmt_dir FROM @sql_dir;
EXECUTE stmt_dir;
DEALLOCATE PREPARE stmt_dir;
