-- 70: Trang thai tram mo rong + Mo hinh tram + Loai uu tien
-- (PLANNING/ACTIVE/DEPLOYING/REJECTED; mo_hinh_tram select LK/TDT/NQ; loai_uu_tien formula post)

-- 1. Mo rong enum stations.status (guard information_schema)
SET @has_planning := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stations' AND COLUMN_NAME = 'status'
    AND COLUMN_TYPE LIKE '%PLANNING%'
);
SET @sql_enum := IF(@has_planning = 0,
  'ALTER TABLE stations MODIFY COLUMN status ENUM(''PLANNING'',''ACTIVE'',''DEPLOYING'',''REJECTED'') NULL DEFAULT ''ACTIVE''',
  'SELECT ''enum stations.status already has PLANNING'' AS info');
PREPARE stmt_enum FROM @sql_enum;
EXECUTE stmt_enum;
DEALLOCATE PREPARE stmt_enum;

-- 2. Cap nhat options field status (4 muc)
UPDATE field_definitions
SET options = '[{"value":"PLANNING","label":"Quy hoạch","color":"#a855f7","borderRadius":"rounded"},{"value":"ACTIVE","label":"Hoạt động","color":"#22c55e","borderRadius":"rounded"},{"value":"DEPLOYING","label":"Triển khai","color":"#eab308","borderRadius":"rounded"},{"value":"REJECTED","label":"Từ chối/Hủy","color":"#b91c1c","borderRadius":"rounded"}]'
WHERE entity = 'stations' AND `key` = 'status';

-- 3. Field Mo hinh tram
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, options, status)
SELECT 'stations', 'mo_hinh_tram', 'Mô hình trạm', 'select', 'json', 0,
  '[{"value":"TDT","label":"Tự đầu tư","color":"#eab308","borderRadius":"rounded"},{"value":"LK","label":"Liên kết","color":"#3b82f6","borderRadius":"rounded"},{"value":"NQ","label":"Nhượng quyền","color":"#166534","borderRadius":"rounded"}]',
  'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'stations' AND `key` = 'mo_hinh_tram');

-- 4. Field Loai uu tien (formula post: TDT=1, con lai=2)
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, formula_config, status)
SELECT 'stations', 'loai_uu_tien', 'Loại ưu tiên', 'formula', 'json', 0,
  '{"expression":"IF(equalText(mo_hinh_tram, ''TDT''), 1, 2)","outputType":"number","decimalPlaces":0,"compute_mode":"post","referencedFields":[]}',
  'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'stations' AND `key` = 'loai_uu_tien');

-- 5. Gan vao form create (12): mo_hinh_tram vao section s1, loai_uu_tien vao section s4
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[0].rows', JSON_OBJECT('id','stations_create_s1_r6','columns','1:1'))
WHERE id = 12 AND JSON_SEARCH(layout_config, 'one', 'stations_create_s1_r6') IS NULL;
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[3].rows', JSON_OBJECT('id','stations_create_s4_r2','columns','1:1'))
WHERE id = 12 AND JSON_SEARCH(layout_config, 'one', 'stations_create_s4_r2') IS NULL;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 12, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 12), 0) + 1, 1,
  '{"rowId":"stations_create_s1_r6","colSpan":1,"colIndex":0,"rowIndex":5}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'mo_hinh_tram'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 12 AND ff.field_id = fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 12, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 12), 0) + 1, 1,
  '{"rowId":"stations_create_s4_r2","colSpan":1,"colIndex":0,"rowIndex":1}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'loai_uu_tien'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 12 AND ff.field_id = fd.id);

-- 6. Gan vao form view (10)
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[0].rows', JSON_OBJECT('id','stations_view_s1_r6','columns','1:1'))
WHERE id = 10 AND JSON_SEARCH(layout_config, 'one', 'stations_view_s1_r6') IS NULL;
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[3].rows', JSON_OBJECT('id','stations_view_s4_r2','columns','1:1'))
WHERE id = 10 AND JSON_SEARCH(layout_config, 'one', 'stations_view_s4_r2') IS NULL;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 10, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 10), 0) + 1, 1,
  '{"rowId":"stations_view_s1_r6","colSpan":1,"colIndex":0,"rowIndex":5}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'mo_hinh_tram'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 10 AND ff.field_id = fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 10, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 10), 0) + 1, 1,
  '{"rowId":"stations_view_s4_r2","colSpan":1,"colIndex":0,"rowIndex":1}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'loai_uu_tien'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 10 AND ff.field_id = fd.id);

-- 7. Gan vao view danh sach tram (id 6)
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT 6, fd.id, COALESCE((SELECT MAX(order_index) FROM view_fields WHERE view_id = 6), 0) + 1, 1, 140, 0, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'mo_hinh_tram'
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = 6 AND vf.field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT 6, fd.id, COALESCE((SELECT MAX(order_index) FROM view_fields WHERE view_id = 6), 0) + 1, 1, 120, 0, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'loai_uu_tien'
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = 6 AND vf.field_id = fd.id);

-- 8. Backfill loai_uu_tien cho tram da co mo_hinh_tram (neu co)
UPDATE stations
SET custom_data = JSON_SET(COALESCE(custom_data, JSON_OBJECT()), '$.loai_uu_tien',
  IF(JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.mo_hinh_tram')) = 'TDT', 1, 2))
WHERE JSON_EXTRACT(custom_data, '$.mo_hinh_tram') IS NOT NULL;
