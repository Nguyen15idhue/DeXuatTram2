-- 197: Add the CMS station code and mark proposals active when ON-station setup is complete.

SET @has_cms_station_code = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'charging_stations'
     AND COLUMN_NAME = 'cms_station_code'
);
SET @cms_station_code_sql = IF(
  @has_cms_station_code = 0,
  'ALTER TABLE charging_stations ADD COLUMN cms_station_code VARCHAR(100) NULL AFTER ma_tram',
  'SELECT 1'
);
PREPARE stmt_cms_station_code FROM @cms_station_code_sql;
EXECUTE stmt_cms_station_code;
DEALLOCATE PREPARE stmt_cms_station_code;

SET @proposal_status_type = (
  SELECT COLUMN_TYPE
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'station_proposals'
     AND COLUMN_NAME = 'status'
);
SET @proposal_status_enum_sql = IF(
  @proposal_status_type NOT LIKE '%ACTIVE%',
  'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(
    ''PENDING'',''REVIEWING'',''PRINCIPLE_APPROVED'',''APPROVED'',''REJECTED'',''CANCELLED'',
    ''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'',
    ''GRADING'',''GDTTKD_EVALUATING'',''RE_GRADING'',''RE_GDTTKD_EVALUATING'',''TGD_REVIEW'',''DESIGNING'',
    ''INFOR_WAITING'',
    ''PROPOSAL_REPORT_CREATING'',''PROPOSAL_REPORT_RE_CREATING'',
    ''PROPOSAL_REPORT_REVIEWING'',''PROPOSAL_REPORT_UPDATING'',
    ''SIGNATURE_PENDING'',''COMPLETED'',''PAUSED'',''ACTIVE''
  ) NULL DEFAULT ''PENDING''',
  'SELECT 1'
);
PREPARE stmt_proposal_status_enum FROM @proposal_status_enum_sql;
EXECUTE stmt_proposal_status_enum;
DEALLOCATE PREPARE stmt_proposal_status_enum;

UPDATE field_definitions
   SET options = JSON_ARRAY_APPEND(COALESCE(options, JSON_ARRAY()), '$', JSON_OBJECT(
     'value', 'ACTIVE',
     'label', 'Hoạt động',
     'color', '#0d9488',
     'icon', 'evStation',
     'sort_order', 20,
     'show_in_legend', 0,
     'borderRadius', 'rounded'
   )),
       updated_at = NOW()
 WHERE entity = 'station_proposals'
   AND `key` = 'status'
   AND JSON_SEARCH(options, 'one', 'ACTIVE', NULL, '$[*].value') IS NULL;
