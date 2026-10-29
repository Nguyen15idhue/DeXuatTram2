-- 188: Replace the final proposal status COMPLETED with APPROVED.
-- Signed approvals are identified by station_proposals.signed_file_id.
-- Idempotent.

UPDATE station_proposals
SET status = 'APPROVED'
WHERE status = 'COMPLETED';

UPDATE field_definitions
SET options = JSON_REMOVE(
      options,
      REPLACE(
        JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'COMPLETED', NULL, '$[*].value')),
        '.value',
        ''
      )
    ),
    updated_at = NOW()
WHERE entity = 'station_proposals'
  AND `key` = 'status'
  AND options IS NOT NULL
  AND JSON_SEARCH(options, 'one', 'COMPLETED', NULL, '$[*].value') IS NOT NULL;

SET @proposal_status_type := (
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'station_proposals'
    AND COLUMN_NAME = 'status'
);
SET @proposal_status_enum_sql := IF(
  @proposal_status_type LIKE '%COMPLETED%',
  'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(
    ''PENDING'',''REVIEWING'',''PRINCIPLE_APPROVED'',''APPROVED'',''REJECTED'',''CANCELLED'',
    ''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'',
    ''GRADING'',''GDTTKD_EVALUATING'',''RE_GRADING'',''RE_GDTTKD_EVALUATING'',''TGD_REVIEW'',''DESIGNING'',
    ''INFOR_WAITING'',
    ''PROPOSAL_REPORT_CREATING'',''PROPOSAL_REPORT_RE_CREATING'',
    ''PROPOSAL_REPORT_REVIEWING'',''PROPOSAL_REPORT_UPDATING'',
    ''SIGNATURE_PENDING'',''PAUSED''
  ) NULL DEFAULT ''PENDING''',
  'SELECT ''COMPLETED is already absent from station_proposals.status'' AS info'
);
PREPARE stmt_proposal_status_enum FROM @proposal_status_enum_sql;
EXECUTE stmt_proposal_status_enum;
DEALLOCATE PREPARE stmt_proposal_status_enum;
