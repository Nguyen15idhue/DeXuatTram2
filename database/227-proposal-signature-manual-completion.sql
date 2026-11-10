SET @signature_completion_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals'
    AND COLUMN_NAME = 'signature_completed_at'
);
SET @signature_completion_sql := IF(
  @signature_completion_exists = 0,
  'ALTER TABLE station_proposals ADD COLUMN signature_completed_at DATETIME NULL',
  'SELECT ''station_proposals.signature_completed_at already exists'' AS info'
);
PREPARE stmt_signature_completion FROM @signature_completion_sql;
EXECUTE stmt_signature_completion;
DEALLOCATE PREPARE stmt_signature_completion;
