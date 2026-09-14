-- 69-add-link-de-xuat-field.sql
-- Them truong formula "Link de xuat" = URL frontend + id record

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, formula_config, status)
SELECT 'station_proposals', 'link_de_xuat', 'Link đề xuất', 'formula', 'json', 0,
  '{"expression": "CONCAT(''http://localhost:5173/admin/proposals/view='', id)", "outputType": "url", "compute_mode": "post", "referencedFields": [], "label": "Link đề xuất"}',
  'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'link_de_xuat');

-- Gan vao view 8 (bang danh sach de xuat)
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT 8, fd.id, COALESCE((SELECT MAX(order_index) FROM view_fields WHERE view_id = 8), 0) + 1, 1, 160, 0, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'station_proposals' AND fd.`key` = 'link_de_xuat'
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = 8 AND vf.field_id = fd.id);
