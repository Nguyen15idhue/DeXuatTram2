-- 71: Them truong Loai uu tien (formula post) cho station_proposals
-- TDT=1, LK/NQ=2 (giong stations)

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, formula_config, status)
SELECT 'station_proposals', 'loai_uu_tien', 'Loại ưu tiên', 'formula', 'json', 0,
  '{"expression":"IF(equalText(mo_hinh_dau_tu, ''TDT''), 1, 2)","outputType":"number","decimalPlaces":0,"compute_mode":"post","referencedFields":[]}',
  'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'loai_uu_tien');

-- Gan vao form create (13) + view (14): them row s8_r3 vao section cuoi
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[7].rows', JSON_OBJECT('id','station_proposals_create_s8_r3','columns','1:1'))
WHERE id = 13 AND JSON_SEARCH(layout_config, 'one', 'station_proposals_create_s8_r3') IS NULL;
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[7].rows', JSON_OBJECT('id','station_proposals_view_s8_r3','columns','1:1'))
WHERE id = 14 AND JSON_SEARCH(layout_config, 'one', 'station_proposals_view_s8_r3') IS NULL;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 13), 0) + 1, 1,
  '{"rowId":"station_proposals_create_s8_r3","colSpan":1,"colIndex":0,"rowIndex":2}'
FROM field_definitions fd
WHERE fd.entity = 'station_proposals' AND fd.`key` = 'loai_uu_tien'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 13 AND ff.field_id = fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 14), 0) + 1, 1,
  '{"rowId":"station_proposals_view_s8_r3","colSpan":1,"colIndex":0,"rowIndex":2}'
FROM field_definitions fd
WHERE fd.entity = 'station_proposals' AND fd.`key` = 'loai_uu_tien'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 14 AND ff.field_id = fd.id);

-- Gan vao view danh sach de xuat (id 8)
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT 8, fd.id, COALESCE((SELECT MAX(order_index) FROM view_fields WHERE view_id = 8), 0) + 1, 1, 110, 0, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'station_proposals' AND fd.`key` = 'loai_uu_tien'
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = 8 AND vf.field_id = fd.id);
