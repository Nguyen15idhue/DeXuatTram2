-- 219-file-preview-cache.sql
-- Cache PDF preview cho file Word (LibreOffice convert). Giữ vĩnh viễn (tài liệu pháp lý).

CREATE TABLE IF NOT EXISTS file_preview_cache (
  source_file_id INT NOT NULL PRIMARY KEY,
  pdf_file_id INT NOT NULL,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fpc_source FOREIGN KEY (source_file_id) REFERENCES files(id) ON DELETE CASCADE,
  CONSTRAINT fk_fpc_pdf FOREIGN KEY (pdf_file_id) REFERENCES files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
