-- 83: Form "Tạo nhanh" de xuat (purpose='create', is_default=0) - 7 truong co ban
--   owner_name, owner_phone, latitude, longitude, address, province, mo_hinh_dau_tu
--   (docs/5/44 - P6, muc 3.6). Form mac dinh (id 13) KHONG doi.
-- Idempotent (NOT EXISTS), khong DROP.

INSERT INTO forms (entity, name, description, status, purpose, is_default, is_locked, layout_config)
SELECT 'station_proposals',
       'Form đề xuất nhanh',
       'Tạo nhanh: chỉ tọa độ + thông tin cơ bản (bổ sung sau bằng sửa đề xuất)',
       'active', 'create', 0, 0,
       '{"rows": [], "sections": [
          {"id": "sp_quick_s1", "title": "Vị trí", "collapsible": false, "rows": [
            {"id": "sp_quick_s1_r1", "columns": "1:2"},
            {"id": "sp_quick_s1_r2", "columns": "1:1"}
          ]},
          {"id": "sp_quick_s2", "title": "Thông tin cơ bản", "collapsible": false, "rows": [
            {"id": "sp_quick_s2_r1", "columns": "1:2"},
            {"id": "sp_quick_s2_r2", "columns": "1:2"}
          ]}
        ]}'
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM forms WHERE entity = 'station_proposals' AND name = 'Form đề xuất nhanh') x
);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT dst.id, f.id, k.ord, 1, k.cfg
FROM forms dst
JOIN (
  SELECT 'latitude' AS k, 0 AS ord,
         '{"rowId": "sp_quick_s1_r1", "colSpan": 1, "colIndex": 0, "rowIndex": 0}' AS cfg
  UNION ALL SELECT 'longitude', 1,
         '{"rowId": "sp_quick_s1_r1", "colSpan": 1, "colIndex": 1, "rowIndex": 0}'
  UNION ALL SELECT 'address', 2,
         '{"rowId": "sp_quick_s1_r2", "colSpan": 1, "colIndex": 0, "rowIndex": 0}'
  UNION ALL SELECT 'owner_name', 3,
         '{"rowId": "sp_quick_s2_r1", "colSpan": 1, "colIndex": 0, "rowIndex": 0}'
  UNION ALL SELECT 'owner_phone', 4,
         '{"rowId": "sp_quick_s2_r1", "colSpan": 1, "colIndex": 1, "rowIndex": 0}'
  UNION ALL SELECT 'province', 5,
         '{"rowId": "sp_quick_s2_r2", "colSpan": 1, "colIndex": 0, "rowIndex": 0}'
  UNION ALL SELECT 'mo_hinh_dau_tu', 6,
         '{"rowId": "sp_quick_s2_r2", "colSpan": 1, "colIndex": 1, "rowIndex": 0}'
) k
JOIN field_definitions f ON f.entity = 'station_proposals' AND f.`key` = k.k AND f.status = 'active'
WHERE dst.entity = 'station_proposals' AND dst.name = 'Form đề xuất nhanh'
  AND NOT EXISTS (SELECT 1 FROM form_fields x WHERE x.form_id = dst.id AND x.field_id = f.id);

SELECT id, entity, name, purpose, is_default, is_locked FROM forms WHERE name = 'Form đề xuất nhanh';
