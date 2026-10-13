-- 157: tao field 'Link de xuat' (station_proposals.link_de_xuat) neu chua co.
-- Field nay tren dev tao tay qua UI nen VPS thieu han: response/API khong co
-- link de xuat. Expression dung {base_url} (computePostFormulas thay truoc khi
-- evaluate; base_url tu env FRONTEND_URL). Gan vao moi view table dang active
-- cua station_proposals (giong dev gan vao 'View Proposals').
-- Idempotent (guard theo cap entity+key va cap view+field).

INSERT INTO field_definitions
  (entity, `key`, label, type, source_type, required, formula_config, status)
SELECT 'station_proposals', 'link_de_xuat', 'Link đề xuất', 'formula', 'json', 0,
  JSON_OBJECT(
    'label', 'Link đề xuất',
    'expression', 'CONCAT(''{base_url}/admin/proposals/view='', id)',
    'outputType', 'url',
    'compute_mode', 'post',
    'referencedFields', JSON_ARRAY()
  ),
  'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'link_de_xuat'
);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT v.id, fd.id,
  (SELECT IFNULL(MAX(vf2.order_index), -1) + 1 FROM view_fields vf2 WHERE vf2.view_id = v.id),
  1, 160, 0, 0
FROM views v
JOIN field_definitions fd ON fd.entity = 'station_proposals' AND fd.`key` = 'link_de_xuat'
WHERE v.entity = 'station_proposals' AND v.usage = 'table' AND v.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = v.id AND field_id = fd.id);
