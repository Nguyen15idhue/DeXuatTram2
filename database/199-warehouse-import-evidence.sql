-- 199: Minh chung (file) cho phieu nhap kho.
-- Idempotent.

CREATE TABLE IF NOT EXISTS warehouse_import_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  import_id INT NOT NULL,
  file_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_warehouse_import_files (import_id, file_id),
  CONSTRAINT fk_wif_import FOREIGN KEY (import_id) REFERENCES warehouse_imports (id) ON DELETE CASCADE,
  CONSTRAINT fk_wif_file FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
