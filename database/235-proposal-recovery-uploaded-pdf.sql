SET @recovery_has_method = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='proposal_document_recoveries' AND COLUMN_NAME='input_method');
SET @recovery_add_method = IF(@recovery_has_method=0,
  'ALTER TABLE proposal_document_recoveries ADD COLUMN input_method ENUM(''DOCX_CONVERT'',''PDF_UPLOAD'') NOT NULL DEFAULT ''DOCX_CONVERT''',
  'SELECT 1');
PREPARE recovery_method_stmt FROM @recovery_add_method;
EXECUTE recovery_method_stmt;
DEALLOCATE PREPARE recovery_method_stmt;

SET @recovery_has_upload = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='proposal_document_recoveries' AND COLUMN_NAME='uploaded_pdf_file_id');
SET @recovery_add_upload = IF(@recovery_has_upload=0,
  'ALTER TABLE proposal_document_recoveries ADD COLUMN uploaded_pdf_file_id INT NULL, ADD CONSTRAINT fk_recovery_uploaded_pdf FOREIGN KEY (uploaded_pdf_file_id) REFERENCES files(id) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE recovery_upload_stmt FROM @recovery_add_upload;
EXECUTE recovery_upload_stmt;
DEALLOCATE PREPARE recovery_upload_stmt;

SET @recovery_has_hash = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='proposal_document_recoveries' AND COLUMN_NAME='uploaded_pdf_sha256');
SET @recovery_add_hash = IF(@recovery_has_hash=0,
  'ALTER TABLE proposal_document_recoveries ADD COLUMN uploaded_pdf_sha256 CHAR(64) NULL',
  'SELECT 1');
PREPARE recovery_hash_stmt FROM @recovery_add_hash;
EXECUTE recovery_hash_stmt;
DEALLOCATE PREPARE recovery_hash_stmt;
