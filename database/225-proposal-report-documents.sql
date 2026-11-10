CREATE TABLE IF NOT EXISTS proposal_report_documents (
  id INT NOT NULL AUTO_INCREMENT,
  proposal_id INT NOT NULL,
  source_file_id INT NOT NULL,
  pdf_file_id INT DEFAULT NULL,
  signing_file_id INT DEFAULT NULL,
  conversion_status ENUM('PENDING','PROCESSING','READY','FAILED') NOT NULL DEFAULT 'PENDING',
  conversion_error TEXT DEFAULT NULL,
  conversion_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  signed_file_id INT DEFAULT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_proposal_report_source (proposal_id, source_file_id),
  KEY idx_report_documents_current (proposal_id, is_current),
  CONSTRAINT fk_report_document_proposal FOREIGN KEY (proposal_id) REFERENCES station_proposals(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_document_source FOREIGN KEY (source_file_id) REFERENCES files(id),
  CONSTRAINT fk_report_document_pdf FOREIGN KEY (pdf_file_id) REFERENCES files(id),
  CONSTRAINT fk_report_document_signing FOREIGN KEY (signing_file_id) REFERENCES files(id),
  CONSTRAINT fk_report_document_final FOREIGN KEY (signed_file_id) REFERENCES files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_report_document_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_signature_configs' AND COLUMN_NAME = 'document_id'
);
SET @add_report_document_id = IF(@has_report_document_id = 0,
  'ALTER TABLE proposal_signature_configs ADD COLUMN document_id INT DEFAULT NULL, ADD INDEX idx_signature_document (document_id)',
  'SELECT 1');
PREPARE stmt_report_document FROM @add_report_document_id;
EXECUTE stmt_report_document;
DEALLOCATE PREPARE stmt_report_document;
