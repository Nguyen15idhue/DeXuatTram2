-- 117: Bang import_jobs cho import Excel nen (docs/8/63, phan 1)
-- Luu job import: tien do, tap ban ghi thanh cong/that bai/chua xu ly (pending khi huy).
-- Idempotent.

CREATE TABLE IF NOT EXISTS import_jobs (
  id VARCHAR(64) PRIMARY KEY,
  entity VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL DEFAULT 'import',
  status ENUM('queued','processing','done','partial','failed','cancelled') DEFAULT 'queued',
  total INT NOT NULL DEFAULT 0,
  done INT NOT NULL DEFAULT 0,
  imported INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  pending INT NOT NULL DEFAULT 0,
  params JSON,
  file_name VARCHAR(255),
  columns JSON,
  failed_rows LONGTEXT,
  failed_truncated TINYINT(1) NOT NULL DEFAULT 0,
  pending_rows LONGTEXT,
  pending_truncated TINYINT(1) NOT NULL DEFAULT 0,
  success_ids JSON,
  warn_details JSON,
  error_message TEXT,
  created_by INT,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_import_status (status, created_at),
  KEY idx_import_user (created_by, created_at),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
