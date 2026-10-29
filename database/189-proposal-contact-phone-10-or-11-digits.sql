-- Allow proposal contact phones to contain 10 or 11 digits.

UPDATE field_definitions
SET placeholder = 'Nhập SĐT 10 hoặc 11 chữ số',
    updated_at = NOW()
WHERE entity = 'station_proposals'
  AND `key` = 'owner_phone';

SET @proposal_phone_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'station_proposals'
    AND CONSTRAINT_NAME = 'chk_station_proposals_owner_phone_length'
    AND CONSTRAINT_TYPE = 'CHECK'
);
SET @proposal_phone_check_sql := IF(
  @proposal_phone_check_exists = 0,
  'ALTER TABLE station_proposals
     ADD CONSTRAINT chk_station_proposals_owner_phone_length
     CHECK (owner_phone REGEXP ''^[0-9]{10,11}$'')',
  'SELECT ''Proposal phone check already exists'' AS info'
);
PREPARE stmt_proposal_phone_check FROM @proposal_phone_check_sql;
EXECUTE stmt_proposal_phone_check;
DEALLOCATE PREPARE stmt_proposal_phone_check;
