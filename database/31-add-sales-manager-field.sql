-- 31: Field "Sales quan ly" trong field_definitions + view 8 (file 25)
-- Quy uoc du an: SQL thu cong, khong DROP TABLE, chay lan luot bang tay.
-- CHAY VOI: mysql ... --default-character-set=utf8mb4
-- Field 110: formula post-compute, hien ten sales quan ly CTV (neu co).

-- Field 110
INSERT INTO field_definitions (entity, `key`, label, type, source_type, formula_config, required)
VALUES ('station_proposals', 'sales_quan_ly', 'Sales quản lý', 'formula', 'json',
  '{"expression": "IF(LEN(sales_name) > 0, sales_name, ''—'')", "outputType": "text", "compute_mode": "post", "referencedFields": []}',
  0);

-- Them vao view 8 (proposals), order_index 15
INSERT INTO view_fields (view_id, field_id, order_index, visible, sortable, filterable, width)
VALUES (8, 110, 15, 1, 0, 0, 150);

-- Backfill custom_data: "—" (hex: E28094) cho sales_quan_ly
UPDATE station_proposals p
LEFT JOIN users u ON p.user_id = u.id
LEFT JOIN users s ON u.parent_id = s.id
SET p.custom_data = JSON_SET(
  COALESCE(p.custom_data, CAST('{}' AS JSON)),
  '$.sales_quan_ly',
  IF(s.id IS NOT NULL, s.full_name, CAST(_utf8mb4 x'E28094' AS CHAR CHARACTER SET utf8mb4))
);
