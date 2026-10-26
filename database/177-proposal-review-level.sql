-- 177: Muc do xem xet (review_level) + trang thai RE_GDTTKD_EVALUATING
-- cho trang "Yeu cau cham diem lai" (Quan ly de xuat).
-- Idempotent: chay lai nhieu lan khong loi, khong nhan doi du lieu.

-- ============ 1. Cot review_level ============
SET @has_review_level := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'review_level'
);
SET @sql_review_level := IF(@has_review_level = 0,
  'ALTER TABLE station_proposals ADD COLUMN review_level TINYINT NULL COMMENT ''1: GĐTTKD xem xét, 2: QH+PL chấm lại, 3: TGĐ xem xét'' AFTER phap_ly_note',
  'SELECT ''cot station_proposals.review_level da ton tai'' AS info');
PREPARE stmt_review_level FROM @sql_review_level;
EXECUTE stmt_review_level;
DEALLOCATE PREPARE stmt_review_level;

-- ============ 2. Them trang thai RE_GDTTKD_EVALUATING vao ENUM ============
SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'status'
);
SET @sql_status_enum := IF(@status_type NOT LIKE '%RE_GDTTKD_EVALUATING%',
  'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(
    ''PENDING'',''REVIEWING'',''PRINCIPLE_APPROVED'',''APPROVED'',''REJECTED'',''CANCELLED'',
    ''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'',
    ''GRADING'',''GDTTKD_EVALUATING'',''RE_GRADING'',''RE_GDTTKD_EVALUATING'',''TGD_REVIEW'',''DESIGNING'',
    ''PROPOSAL_REPORT_CREATING'',''PROPOSAL_REPORT_REVIEWING'',''SIGNATURE_PENDING'',''COMPLETED''
  ) NULL DEFAULT ''PENDING''',
  'SELECT ''status enum da co RE_GDTTKD_EVALUATING'' AS info');
PREPARE stmt_status_enum FROM @sql_status_enum;
EXECUTE stmt_status_enum;
DEALLOCATE PREPARE stmt_status_enum;

-- ============ 3. Index cho danh sach theo muc do xem xet ============
SET @has_idx_review := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND INDEX_NAME = 'idx_proposal_review_level'
);
SET @sql_idx_review := IF(@has_idx_review = 0,
  'ALTER TABLE station_proposals ADD INDEX idx_proposal_review_level (review_level, status)',
  'SELECT ''index idx_proposal_review_level da ton tai'' AS info');
PREPARE stmt_idx_review FROM @sql_idx_review;
EXECUTE stmt_idx_review;
DEALLOCATE PREPARE stmt_idx_review;

-- ============ 4. Field definition review_level ============
INSERT INTO field_definitions
  (entity, `key`, label, type, source_type, required, number_format, decimal_places, help_text, is_locked, status)
SELECT 'station_proposals', 'review_level', 'Mức độ xem xét', 'number', 'fixed', 0, 'integer', 0,
       '1: GĐTTKD xem xét; 2: Quy hoạch và Pháp lý chấm điểm lại; 3: Tổng giám đốc xem xét', 1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'review_level'
);

-- ============ 5. Them option trang thai vao field status ============
UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'RE_GDTTKD_EVALUATING',
  'label', 'GĐTTKD xem xét lại',
  'color', '#8b5cf6',
  'icon', 'search',
  'sort_order', 12.5,
  'show_in_legend', 0,
  'borderRadius', 'rounded'
))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_SEARCH(options, 'one', 'RE_GDTTKD_EVALUATING', NULL, '$[*].value') IS NULL;

-- ============ 6. Dua cot review_level vao bang de xuat mac dinh ============
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT 8, f.id, 19, 1, 130, 1, 0
FROM field_definitions f
WHERE f.entity = 'station_proposals' AND f.`key` = 'review_level'
  AND NOT EXISTS (
    SELECT 1 FROM view_fields vf WHERE vf.view_id = 8 AND vf.field_id = f.id
  );
