-- 179: Buoc Lap to trinh BCĐX (PROPOSAL_REPORT_RE_CREATING)
-- - Them trang thai PROPOSAL_REPORT_RE_CREATING (Back office yeu cau tao lai BCĐX)
-- - Them field file_bc_dx (file) cho file tờ trình BCĐX + gan vao form Xem/sua (id 14)
-- Idempotent: chay lai nhieu lan khong loi, khong nhan doi du lieu.

-- ============ 1. Them trang thai PROPOSAL_REPORT_RE_CREATING vao ENUM ============
SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'status'
);
SET @sql_status_enum := IF(@status_type NOT LIKE '%PROPOSAL_REPORT_RE_CREATING%',
  'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(
    ''PENDING'',''REVIEWING'',''PRINCIPLE_APPROVED'',''APPROVED'',''REJECTED'',''CANCELLED'',
    ''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'',
    ''GRADING'',''GDTTKD_EVALUATING'',''RE_GRADING'',''RE_GDTTKD_EVALUATING'',''TGD_REVIEW'',''DESIGNING'',
    ''INFOR_WAITING'',
    ''PROPOSAL_REPORT_CREATING'',''PROPOSAL_REPORT_RE_CREATING'',
    ''PROPOSAL_REPORT_REVIEWING'',''SIGNATURE_PENDING'',''COMPLETED''
  ) NULL DEFAULT ''PENDING''',
  'SELECT ''status enum da co PROPOSAL_REPORT_RE_CREATING'' AS info');
PREPARE stmt_status_enum FROM @sql_status_enum;
EXECUTE stmt_status_enum;
DEALLOCATE PREPARE stmt_status_enum;

-- ============ 2. Field definition file_bc_dx (file to trinh BCĐX) ============
INSERT INTO field_definitions
  (entity, `key`, label, type, source_type, required, help_text, is_locked, status)
SELECT 'station_proposals', 'file_bc_dx', 'Tờ trình BCĐX', 'file', 'json', 0,
       'File tờ trình Ban Chỉ đạo Xây dựng do GĐTTKD hoặc người đề xuất tải lên', 1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'file_bc_dx'
);

-- ============ 3. Them option trang thai PROPOSAL_REPORT_RE_CREATING ============
UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'PROPOSAL_REPORT_RE_CREATING',
  'label', 'Yêu cầu tạo lại BCĐX',
  'color', '#f59e0b',
  'icon', 'clipboardList',
  'sort_order', 15.5,
  'show_in_legend', 0,
  'borderRadius', 'rounded'
))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_SEARCH(options, 'one', 'PROPOSAL_REPORT_RE_CREATING', NULL, '$[*].value') IS NULL;

-- ============ 4. Gan field file_bc_dx vao form Xem/sua de xuat (id 14) ============
SET @report_field_id := (
  SELECT id FROM field_definitions
  WHERE entity = 'station_proposals' AND `key` = 'file_bc_dx' LIMIT 1
);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, @report_field_id,
       (SELECT COALESCE(MAX(order_index), 0) + 1 FROM form_fields WHERE form_id = 14),
       1,
       JSON_OBJECT('rowId', 'station_proposals_view_s7_r4', 'colSpan', 1, 'colIndex', 0, 'rowIndex', 3)
FROM DUAL
WHERE @report_field_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM form_fields WHERE form_id = 14 AND field_id = @report_field_id
  );

UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(
      layout_config,
      '$.sections[6].rows',
      JSON_OBJECT('id', 'station_proposals_view_s7_r4', 'columns', '1:1')
    ),
    updated_at = NOW()
WHERE id = 14
  AND layout_config IS NOT NULL
  AND JSON_SEARCH(layout_config, 'one', 'station_proposals_view_s7_r4') IS NULL;
