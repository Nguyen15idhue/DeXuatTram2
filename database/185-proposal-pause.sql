-- 185: Cho phep tam dung de xuat va khoi phuc trang thai truoc do.
-- Idempotent: chay lai nhieu lan khong loi, khong nhan doi du lieu.

SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'status'
);
SET @sql_status_enum := IF(@status_type NOT LIKE '%PAUSED%',
  'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(
    ''PENDING'',''REVIEWING'',''PRINCIPLE_APPROVED'',''APPROVED'',''REJECTED'',''CANCELLED'',
    ''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'',
    ''GRADING'',''GDTTKD_EVALUATING'',''RE_GRADING'',''RE_GDTTKD_EVALUATING'',''TGD_REVIEW'',''DESIGNING'',
    ''INFOR_WAITING'',
    ''PROPOSAL_REPORT_CREATING'',''PROPOSAL_REPORT_RE_CREATING'',
    ''PROPOSAL_REPORT_REVIEWING'',''PROPOSAL_REPORT_UPDATING'',
    ''SIGNATURE_PENDING'',''COMPLETED'',''PAUSED''
  ) NULL DEFAULT ''PENDING''',
  'SELECT ''status enum da co PAUSED'' AS info');
PREPARE stmt_status_enum FROM @sql_status_enum;
EXECUTE stmt_status_enum;
DEALLOCATE PREPARE stmt_status_enum;

SET @has_paused_from_status := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'paused_from_status'
);
SET @sql_paused_from_status := IF(@has_paused_from_status = 0,
  'ALTER TABLE station_proposals ADD COLUMN paused_from_status VARCHAR(50) NULL COMMENT ''Trang thai truoc khi tam dung'' AFTER status',
  'SELECT ''cot station_proposals.paused_from_status da ton tai'' AS info');
PREPARE stmt_paused_from_status FROM @sql_paused_from_status;
EXECUTE stmt_paused_from_status;
DEALLOCATE PREPARE stmt_paused_from_status;

SET @has_paused_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'paused_at'
);
SET @sql_paused_at := IF(@has_paused_at = 0,
  'ALTER TABLE station_proposals ADD COLUMN paused_at DATETIME NULL COMMENT ''Thoi diem tam dung'' AFTER paused_from_status',
  'SELECT ''cot station_proposals.paused_at da ton tai'' AS info');
PREPARE stmt_paused_at FROM @sql_paused_at;
EXECUTE stmt_paused_at;
DEALLOCATE PREPARE stmt_paused_at;

UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(COALESCE(options, JSON_ARRAY()), '$', JSON_OBJECT(
  'value', 'PAUSED',
  'label', 'Tạm dừng',
  'color', '#64748b',
  'icon', 'pause',
  'sort_order', 19,
  'show_in_legend', 0,
  'borderRadius', 'rounded'
))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_SEARCH(options, 'one', 'PAUSED', NULL, '$[*].value') IS NULL;
