-- 218-crm-full-sync-runs.sql
-- Lần đồng bộ toàn bộ khách hàng từ TMT CRM về Quản lý leads + danh sách bỏ qua/lỗi.

CREATE TABLE IF NOT EXISTS crm_full_sync_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  status ENUM('QUEUED','RUNNING','SUCCESS','PARTIAL','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  `cursor` TEXT NULL,
  pages INT NOT NULL DEFAULT 0,
  fetched INT NOT NULL DEFAULT 0,
  inserted INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  triggered_by INT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_crm_full_sync_status (status, created_at),
  KEY ix_crm_full_sync_created (created_at),
  CONSTRAINT fk_crm_full_sync_triggered_by FOREIGN KEY (triggered_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crm_full_sync_issues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  crm_lead_id VARCHAR(100) NULL,
  name VARCHAR(255) NULL,
  phone VARCHAR(32) NULL,
  result ENUM('SKIPPED','FAILED') NOT NULL,
  reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_crm_full_sync_issues_run (run_id, result),
  CONSTRAINT fk_crm_full_sync_issues_run FOREIGN KEY (run_id) REFERENCES crm_full_sync_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
