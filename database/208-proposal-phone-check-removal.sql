-- Remove the optional proposal phone CHECK constraint while preserving VARCHAR(20).
-- The column type is intentionally unchanged.

SET @proposal_phone_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'station_proposals'
    AND CONSTRAINT_NAME = 'chk_station_proposals_owner_phone_length'
    AND CONSTRAINT_TYPE = 'CHECK'
);
SET @proposal_phone_check_sql := IF(
  @proposal_phone_check_exists > 0,
  'ALTER TABLE station_proposals DROP CHECK chk_station_proposals_owner_phone_length',
  'SELECT ''Proposal phone CHECK constraint is absent'' AS info'
);
PREPARE stmt_proposal_phone_check FROM @proposal_phone_check_sql;
EXECUTE stmt_proposal_phone_check;
DEALLOCATE PREPARE stmt_proposal_phone_check;
