-- 41: Them truong ID 1Office (formula post-compute dung metadata id_1office) cho station_proposals

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, formula_config, status)
SELECT 'station_proposals', 'id_1office', 'ID 1Office', 'formula', 'json', 0,
  '{"expression": "IF(LEN(id_1office) > 0, id_1office, ''Chưa liên kết'')", "outputType": "text", "compute_mode": "post", "referencedFields": []}',
  'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'id_1office');

-- Gan vao form 13 (cuoi form, render khoi mac dinh vi khong co rowId)
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 13), 0) + 1, 1, NULL
FROM field_definitions fd
WHERE fd.entity = 'station_proposals' AND fd.`key` = 'id_1office'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 13 AND ff.field_id = fd.id);

-- Gan vao view 8 (cuoi bang)
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT 8, fd.id, COALESCE((SELECT MAX(order_index) FROM view_fields WHERE view_id = 8), 0) + 1, 1, 120, 1, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'station_proposals' AND fd.`key` = 'id_1office'
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = 8 AND vf.field_id = fd.id);
