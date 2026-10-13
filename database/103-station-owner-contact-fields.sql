-- 103: Them field tram "chu_tram" (ten chu tram) + "sdt_chu_tram" (SDT chu tram)
-- Muc dich: hien thi thong tin lien he chu tram tren popup preview lan can.
-- Idempotent: chi them field/row/field-mapping neu chua co.

-- ============ 1. field_definitions ============
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'stations', 'chu_tram', 'Chủ trạm', 'text', 'json', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'stations' AND `key` = 'chu_tram');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'stations', 'sdt_chu_tram', 'SĐT chủ trạm', 'phone', 'json', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'stations' AND `key` = 'sdt_chu_tram');

-- ============ 2. Gan vao form create (12) - section s1 ============
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[0].rows', JSON_OBJECT('id','stations_create_s1_r6','columns','1:2'))
WHERE id = 12 AND JSON_SEARCH(layout_config, 'one', 'stations_create_s1_r6') IS NULL;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 12, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 12), 0) + 1, 1,
  '{"rowId":"stations_create_s1_r6","colSpan":1,"colIndex":0,"rowIndex":5}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'chu_tram'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 12 AND ff.field_id = fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 12, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 12), 0) + 1, 1,
  '{"rowId":"stations_create_s1_r6","colSpan":1,"colIndex":1,"rowIndex":5}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'sdt_chu_tram'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 12 AND ff.field_id = fd.id);

-- ============ 3. Gan vao form view (10) - section s1 ============
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[0].rows', JSON_OBJECT('id','stations_view_s1_r7','columns','1:2'))
WHERE id = 10 AND JSON_SEARCH(layout_config, 'one', 'stations_view_s1_r7') IS NULL;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 10, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 10), 0) + 1, 1,
  '{"rowId":"stations_view_s1_r7","colSpan":1,"colIndex":0,"rowIndex":6}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'chu_tram'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 10 AND ff.field_id = fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 10, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 10), 0) + 1, 1,
  '{"rowId":"stations_view_s1_r7","colSpan":1,"colIndex":1,"rowIndex":6}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'sdt_chu_tram'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 10 AND ff.field_id = fd.id);

-- ============ 4. Gan vao view danh sach tram (6) ============
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT 6, fd.id, COALESCE((SELECT MAX(order_index) FROM view_fields WHERE view_id = 6), 0) + 1, 1, 160, 0, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'chu_tram'
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = 6 AND vf.field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT 6, fd.id, COALESCE((SELECT MAX(order_index) FROM view_fields WHERE view_id = 6), 0) + 1, 1, 140, 0, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'sdt_chu_tram'
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = 6 AND vf.field_id = fd.id);
