-- 174: Bo sung 9 trang thai moi cua quy trinh de xuat (status flow v2)
--      + cot note (ghi chu / trang thai chi tiet)
--      + cot chot_so_luong_tru (JSON: mo hinh / so luong / loai tru)
-- Idempotent: chay lai nhieu lan khong loi, khong nhan doi du lieu.

-- ============ 1. ENUM station_proposals.status: 9 -> 18 gia tri ============
SET @has_grading := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'status'
    AND COLUMN_TYPE LIKE '%GRADING%'
);
SET @sql_enum := IF(@has_grading = 0,
'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(
''PENDING'',''REVIEWING'',''PRINCIPLE_APPROVED'',''APPROVED'',''REJECTED'',''CANCELLED'',''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'',
''GRADING'',''GDTTKD_EVALUATING'',''RE_GRADING'',''TGD_REVIEW'',''DESIGNING'',''PROPOSAL_REPORT_CREATING'',''PROPOSAL_REPORT_REVIEWING'',''SIGNATURE_PENDING'',''COMPLETED'')
NULL DEFAULT ''PENDING''',
'SELECT ''enum station_proposals.status da co GRADING'' AS info');
PREPARE stmt_enum FROM @sql_enum;
EXECUTE stmt_enum;
DEALLOCATE PREPARE stmt_enum;

-- ============ 2. Cot note (nullable) ============
SET @has_note := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'note'
);
SET @sql_note := IF(@has_note = 0,
'ALTER TABLE station_proposals ADD COLUMN note TEXT NULL AFTER info_completed_at',
'SELECT ''cot station_proposals.note da ton tai'' AS info');
PREPARE stmt_note FROM @sql_note;
EXECUTE stmt_note;
DEALLOCATE PREPARE stmt_note;

-- ============ 3. Cot chot_so_luong_tru (JSON, nullable) ============
SET @has_pole := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'chot_so_luong_tru'
);
SET @sql_pole := IF(@has_pole = 0,
'ALTER TABLE station_proposals ADD COLUMN chot_so_luong_tru JSON NULL AFTER note',
'SELECT ''cot station_proposals.chot_so_luong_tru da ton tai'' AS info');
PREPARE stmt_pole FROM @sql_pole;
EXECUTE stmt_pole;
DEALLOCATE PREPARE stmt_pole;

-- ============ 4. Field definitions cho 2 cot moi ============
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, source_config, is_locked, status)
SELECT 'station_proposals', 'note', 'Ghi chú', 'textarea', 'fixed', 0, NULL, 1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'note'
);

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, source_config, is_locked, status)
SELECT 'station_proposals', 'chot_so_luong_tru', 'Số lượng trụ chốt', 'table', 'fixed', 0,
'{"columns":[{"key":"mo_hinh","label":"Mô hình","column_type":"select","required":true,"width":220,"options":[{"value":"TDT","label":"TDT"},{"value":"LK","label":"LK"},{"value":"NQ","label":"NQ"},{"value":"NQ_LK","label":"NQ_LK"}]},{"key":"so_luong","label":"Số lượng","column_type":"number","required":true,"width":140,"display_format":"dot","footer_formula":"SUM"},{"key":"loai_tru","label":"Loại trụ","column_type":"text","required":true,"width":220}],"min_rows":0,"max_rows":50}',
1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'chot_so_luong_tru'
);

-- ============ 5. Them 9 option trang thai vao field_definitions ============
-- Moi UPDATE chi them khi option chua ton tai (idempotent).
UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'GRADING', 'label', 'Đang đánh giá quy hoạch và pháp lý',
  'color', '#f59e0b', 'icon', 'clipboardList', 'borderRadius', 'rounded',
  'sort_order', 10, 'show_in_legend', 0))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value', 'GRADING'));

UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'GDTTKD_EVALUATING', 'label', 'GĐTTKD đánh giá',
  'color', '#7c3aed', 'icon', 'chartUp', 'borderRadius', 'rounded',
  'sort_order', 11, 'show_in_legend', 0))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value', 'GDTTKD_EVALUATING'));

UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'RE_GRADING', 'label', 'GĐTTKD yêu cầu chấm lại',
  'color', '#6366f1', 'icon', 'play', 'borderRadius', 'rounded',
  'sort_order', 12, 'show_in_legend', 0))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value', 'RE_GRADING'));

UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'TGD_REVIEW', 'label', 'Đang trình Tổng giám đốc',
  'color', '#be123c', 'icon', 'send', 'borderRadius', 'rounded',
  'sort_order', 13, 'show_in_legend', 0))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value', 'TGD_REVIEW'));

UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'DESIGNING', 'label', 'Đang vẽ Layout',
  'color', '#0891b2', 'icon', 'draftingCompass', 'borderRadius', 'rounded',
  'sort_order', 14, 'show_in_legend', 0))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value', 'DESIGNING'));

UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'PROPOSAL_REPORT_CREATING', 'label', 'Đang lập tờ trình BCĐX',
  'color', '#0d9488', 'icon', 'document', 'borderRadius', 'rounded',
  'sort_order', 15, 'show_in_legend', 0))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value', 'PROPOSAL_REPORT_CREATING'));

UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'PROPOSAL_REPORT_REVIEWING', 'label', 'Đang duyệt BCĐX',
  'color', '#2563eb', 'icon', 'folderCheck', 'borderRadius', 'rounded',
  'sort_order', 16, 'show_in_legend', 0))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value', 'PROPOSAL_REPORT_REVIEWING'));

UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'SIGNATURE_PENDING', 'label', 'Đang trình ký',
  'color', '#9333ea', 'icon', 'penSign', 'borderRadius', 'rounded',
  'sort_order', 17, 'show_in_legend', 0))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value', 'SIGNATURE_PENDING'));

UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'COMPLETED', 'label', 'Đã phê duyệt',
  'color', '#16a34a', 'icon', 'check', 'borderRadius', 'rounded',
  'sort_order', 18, 'show_in_legend', 0))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value', 'COMPLETED'));
