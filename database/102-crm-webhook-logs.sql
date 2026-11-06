-- 102-crm-webhook-logs.sql
-- Trang thống kê/ghi log webhook (CRM <-> TMT-EGREEN)

CREATE TABLE IF NOT EXISTS crm_webhook_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  direction ENUM('inbound','outbound') NOT NULL,
  sender VARCHAR(64) NOT NULL,
  receiver VARCHAR(64) NOT NULL,
  event_id VARCHAR(120) NULL,
  event_type VARCHAR(64) NULL,
  lead_id BIGINT UNSIGNED NULL,
  crm_lead_id VARCHAR(100) NULL,
  status VARCHAR(32) NOT NULL,
  http_status INT NULL,
  payload JSON NULL,
  response JSON NULL,
  error TEXT NULL,
  duration_ms INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_direction (direction),
  KEY ix_status (status),
  KEY ix_created (created_at),
  KEY ix_lead (lead_id, crm_lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
