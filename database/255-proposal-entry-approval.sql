SET @request_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_requests' AND COLUMN_NAME = 'request_type'
);
SET @sql := IF(@request_type NOT LIKE '%ENTRY_APPROVAL%',
  CONCAT('ALTER TABLE proposal_requests MODIFY COLUMN request_type ',
    LEFT(@request_type, CHAR_LENGTH(@request_type) - 1),
    ',''ENTRY_APPROVAL'') NOT NULL DEFAULT ''UPDATE_INFO'''),
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
