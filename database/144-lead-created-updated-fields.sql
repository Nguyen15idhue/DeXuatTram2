-- 144: Them truong Thoi gian tao / Thoi gian cap nhat cho leads (view + form, read-only).
-- - field_definitions: created_at (sau STT), updated_at (cuoi cung).
-- - view 'Bảng Lead': created_at order 0, updated_at order 999.
-- - form view 'Lead - Xem / sửa': them row leads_view_s1_r7 + 2 field.
-- - Read-only xu ly o FE qua source_config.readonly.
-- Idempotent.

-- ===== Field definitions =====
INSERT INTO field_definitions (entity, `key`, label, type, source_type, display_format, date_format, required, source_config, status)
SELECT 'leads', 'created_at', 'Thời gian tạo', 'datetime', 'fixed', 'plain', 'DD/MM/YYYY', 0, '{"readonly": true}', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'created_at');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, display_format, date_format, required, source_config, status)
SELECT 'leads', 'updated_at', 'Thời gian cập nhật', 'datetime', 'fixed', 'plain', 'DD/MM/YYYY', 0, '{"readonly": true}', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'updated_at');

-- ===== View 'Bảng Lead' =====
SET @lv = (SELECT id FROM views WHERE entity = 'leads' AND `usage` = 'table' ORDER BY id LIMIT 1);

SET @has_ca = (SELECT COUNT(*) FROM view_fields vf JOIN field_definitions fd ON fd.id = vf.field_id WHERE vf.view_id = @lv AND fd.`key` = 'created_at');
UPDATE view_fields SET order_index = order_index + 1 WHERE view_id = @lv AND @has_ca = 0;

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lv, fd.id, 0, 1, 150, 1, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'created_at'
  AND @lv IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lv AND vf.field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lv, fd.id, 999, 1, 150, 1, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'updated_at'
  AND @lv IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lv AND vf.field_id = fd.id);

-- ===== Form view 'Lead - Xem / sửa' =====
SET @lf = (SELECT id FROM forms WHERE entity = 'leads' AND purpose = 'view' ORDER BY is_default DESC, id ASC LIMIT 1);

UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[0].rows', JSON_OBJECT('id', 'leads_view_s1_r7', 'columns', '1:2'))
WHERE id = @lf AND layout_config IS NOT NULL AND JSON_SEARCH(layout_config, 'one', 'leads_view_s1_r7') IS NULL;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lf, fd.id, 20, 1, '{"rowId":"leads_view_s1_r7","colIndex":0,"rowIndex":6,"colSpan":1}'
FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'created_at'
  AND @lf IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lf AND ff.field_id = fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lf, fd.id, 21, 1, '{"rowId":"leads_view_s1_r7","colIndex":1,"rowIndex":6,"colSpan":1}'
FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'updated_at'
  AND @lf IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lf AND ff.field_id = fd.id);
