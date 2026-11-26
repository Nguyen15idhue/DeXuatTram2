SET @has_report_anchor_snapshot = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_report_documents'
    AND COLUMN_NAME = 'signature_anchor_snapshot'
);
SET @add_report_anchor_snapshot = IF(@has_report_anchor_snapshot = 0,
  'ALTER TABLE proposal_report_documents ADD COLUMN signature_anchor_snapshot JSON DEFAULT NULL',
  'SELECT 1');
PREPARE stmt_report_anchor_snapshot FROM @add_report_anchor_snapshot;
EXECUTE stmt_report_anchor_snapshot;
DEALLOCATE PREPARE stmt_report_anchor_snapshot;
