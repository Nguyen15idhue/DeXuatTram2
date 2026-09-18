-- 92: Dua nguoi_phu_trach + nguoi_giao_phu_trach vao form 14 (view/sua) de xem/sua tay (docs/8/47 - Buoc 3)
-- Form 13 (create) giu nguyen (BE tu dien khi submit)
-- Idempotent.

UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[8].rows', JSON_OBJECT('id','station_proposals_view_s8_r4','columns','1:2'))
WHERE id = 14 AND JSON_SEARCH(layout_config, 'one', 'station_proposals_view_s8_r4') IS NULL;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 14), 0) + 1, 1,
  '{"rowId":"station_proposals_view_s8_r4","colSpan":1,"colIndex":0,"rowIndex":3}'
FROM field_definitions fd
WHERE fd.entity = 'station_proposals' AND fd.`key` = 'nguoi_phu_trach'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 14 AND ff.field_id = fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 14), 0) + 1, 1,
  '{"rowId":"station_proposals_view_s8_r4","colSpan":1,"colIndex":1,"rowIndex":3}'
FROM field_definitions fd
WHERE fd.entity = 'station_proposals' AND fd.`key` = 'nguoi_giao_phu_trach'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 14 AND ff.field_id = fd.id);
