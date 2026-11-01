-- Lưu lịch sử các lượt đồng bộ nhu cầu sạc lên Google Sheets.
-- Idempotent; không lưu dữ liệu khách hàng hoặc thông tin xác thực.

CREATE TABLE IF NOT EXISTS ev_report_sheet_sync_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trigger_type ENUM('manual', 'scheduled') NOT NULL,
  status ENUM('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED') NOT NULL,
  triggered_by INT NULL,
  scanned_count INT NOT NULL DEFAULT 0,
  inserted_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ev_report_sheet_sync_runs_started (started_at),
  CONSTRAINT fk_ev_report_sheet_sync_runs_user
    FOREIGN KEY (triggered_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
