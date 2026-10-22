-- 181: Buoc lap to trinh BCĐX - So luong tru chot + Tong gia tri chot
-- - Reuse cot JSON `chot_so_luong_tru` (Số lượng trụ chốt) + them cot DECIMAL `tong_gia_tri_chot`
-- - Cap nhat field `chot_so_luong_tru`: them cot "Giá chốt" (tu dong dieu theo gia hien tai cua loai tru)
--   + cot "Thành tiền" (so_luong * gia_chot)
-- - Gan 2 field vao form Xem/sua de xuat (id 14)
-- Idempotent: chay lai nhieu lan khong loi, khong nhan doi du lieu.

-- ============ 1. Them cot tong_gia_tri_chot ============
SET @has_total := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'tong_gia_tri_chot'
);
SET @sql_total := IF(@has_total = 0,
  'ALTER TABLE station_proposals ADD COLUMN tong_gia_tri_chot DECIMAL(18,2) NULL COMMENT ''Tổng giá trị chốt của số trụ chốt'' AFTER chot_so_luong_tru',
  'SELECT ''cot station_proposals.tong_gia_tri_chot da ton tai'' AS info');
PREPARE stmt_total FROM @sql_total;
EXECUTE stmt_total;
DEALLOCATE PREPARE stmt_total;

-- ============ 2. Cap nhat field chot_so_luong_tru (them Gia chot + Thanh tien) ============
UPDATE field_definitions
SET source_config = JSON_OBJECT(
  'columns', JSON_ARRAY(
    JSON_OBJECT(
      'key', 'mo_hinh',
      'label', 'Mô hình liên kết',
      'width', 220,
      'options', JSON_ARRAY(
        JSON_OBJECT('label', 'TDT', 'value', 'TDT'),
        JSON_OBJECT('label', 'LK', 'value', 'LK'),
        JSON_OBJECT('label', 'NQ', 'value', 'NQ'),
        JSON_OBJECT('label', 'NQ_LK', 'value', 'NQ_LK')
      ),
      'required', TRUE,
      'column_type', 'select'
    ),
    JSON_OBJECT(
      'key', 'so_luong',
      'label', 'Số lượng',
      'width', 120,
      'required', TRUE,
      'column_type', 'number',
      'display_format', 'dot',
      'footer_formula', 'SUM'
    ),
    JSON_OBJECT(
      'key', 'loai_tru',
      'label', 'Loại trụ',
      'width', 220,
      'required', TRUE,
      'column_type', 'select',
      'data_list_id', 18,
      'data_list_column', 'ten'
    ),
    JSON_OBJECT(
      'key', 'gia_chot',
      'label', 'Giá chốt',
      'width', 160,
      'column_type', 'number',
      'autofill_from', 'loai_tru',
      'autofill_column', 'gia',
      'display_format', 'dot'
    ),
    JSON_OBJECT(
      'key', 'thanh_tien',
      'label', 'Thành tiền',
      'width', 160,
      'column_type', 'number',
      'formula', 'so_luong * gia_chot',
      'display_format', 'dot'
    )
  ),
  'max_rows', 50,
  'min_rows', 1
),
help_text = 'Số lượng trụ chốt khi lập tờ trình BCĐX: mô hình liên kết, số lượng, loại trụ, giá chốt (tự động theo giá hiện tại của loại trụ)',
updated_at = NOW()
WHERE entity = 'station_proposals' AND `key` = 'chot_so_luong_tru';

-- ============ 3. Field definition tong_gia_tri_chot ============
INSERT INTO field_definitions
  (entity, `key`, label, type, source_type, required, display_format, decimal_places, unit,
   help_text, is_locked, status)
SELECT 'station_proposals', 'tong_gia_tri_chot', 'Tổng giá trị chốt', 'number', 'fixed', 0,
       'dot', 0, 'VND',
       'Tự động tính từ Số lượng trụ chốt (số lượng × giá chốt)', 1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'tong_gia_tri_chot'
);

-- ============ 4. Gan 2 field vao form Xem/sua de xuat (id 14) ============
SET @chot_field_id := (
  SELECT id FROM field_definitions
  WHERE entity = 'station_proposals' AND `key` = 'chot_so_luong_tru' LIMIT 1
);
SET @total_field_id := (
  SELECT id FROM field_definitions
  WHERE entity = 'station_proposals' AND `key` = 'tong_gia_tri_chot' LIMIT 1
);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, @chot_field_id,
       (SELECT COALESCE(MAX(order_index), 0) + 1 FROM form_fields WHERE form_id = 14),
       1,
       JSON_OBJECT('rowId', 'station_proposals_view_s3_r7', 'colSpan', 2, 'colIndex', 0, 'rowIndex', 6)
FROM DUAL
WHERE @chot_field_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM form_fields WHERE form_id = 14 AND field_id = @chot_field_id
  );

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, @total_field_id,
       (SELECT COALESCE(MAX(order_index), 0) + 1 FROM form_fields WHERE form_id = 14),
       1,
       JSON_OBJECT('rowId', 'station_proposals_view_s3_r8', 'colSpan', 2, 'colIndex', 0, 'rowIndex', 7)
FROM DUAL
WHERE @total_field_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM form_fields WHERE form_id = 14 AND field_id = @total_field_id
  );

UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(
      layout_config,
      '$.sections[2].rows',
      JSON_OBJECT('id', 'station_proposals_view_s3_r7', 'columns', '1:2')
    ),
    updated_at = NOW()
WHERE id = 14
  AND layout_config IS NOT NULL
  AND JSON_SEARCH(layout_config, 'one', 'station_proposals_view_s3_r7') IS NULL;

UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(
      layout_config,
      '$.sections[2].rows',
      JSON_OBJECT('id', 'station_proposals_view_s3_r8', 'columns', '1:2')
    ),
    updated_at = NOW()
WHERE id = 14
  AND layout_config IS NOT NULL
  AND JSON_SEARCH(layout_config, 'one', 'station_proposals_view_s3_r8') IS NULL;
