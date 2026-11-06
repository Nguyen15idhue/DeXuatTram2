-- 100-crm-integration-schema.sql
-- CRM integration (TMT CRM <-> TMT-EGREEN): schema for inbound/outbound lead sync.

-- 1) leads: store CRM external id
ALTER TABLE leads
  ADD COLUMN external_crm_id VARCHAR(100) NULL;

CREATE UNIQUE INDEX ux_leads_external_crm_id
  ON leads (external_crm_id);

-- 2) crm_outbox: outbound events to CRM (outbox pattern)
CREATE TABLE IF NOT EXISTS crm_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(120) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  lead_id BIGINT UNSIGNED NULL,
  crm_lead_id VARCHAR(100) NULL,
  payload JSON NOT NULL,
  status ENUM('pending','sending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_retry_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  response TEXT NULL,
  last_error TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY ux_crm_outbox_event_id (event_id),
  KEY ix_crm_outbox_status_next (status, next_retry_at),
  KEY ix_crm_outbox_lead (lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) crm_inbound_events: dedup inbound event ids from CRM
CREATE TABLE IF NOT EXISTS crm_inbound_events (
  event_id VARCHAR(120) NOT NULL,
  event_type VARCHAR(64) NULL,
  crm_lead_id VARCHAR(100) NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('received','processed','failed','skipped') NOT NULL DEFAULT 'received',
  error TEXT NULL,
  PRIMARY KEY (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
