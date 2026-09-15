-- 79: Seed 6 view Excel (excel_full + excel_basic cho 3 entity) + view_fields
--   excel_full  = copy toan bo view_fields cua view `usage`='table' (cung entity)
--   excel_basic = subset cot cot loi (xem danh sach duoi)
-- Idempotent (NOT EXISTS), khong DROP.

-- ============ 1. Tao 6 view ============
INSERT INTO views (entity, name, description, status, `usage`, is_locked)
SELECT e.entity, CONCAT('Excel ', e.label, ' – đầy đủ'), 'Toàn bộ cột như view bảng', 'active', 'excel_full', 1
FROM (
  SELECT 'stations' AS entity, 'Trạm' AS label
  UNION ALL SELECT 'station_proposals', 'Đề xuất'
  UNION ALL SELECT 'users', 'Người dùng'
) e
WHERE NOT EXISTS (SELECT 1 FROM views v WHERE v.entity = e.entity AND v.`usage` = 'excel_full');

INSERT INTO views (entity, name, description, status, `usage`, is_locked)
SELECT e.entity, CONCAT('Excel ', e.label, ' – cơ bản'), 'Chỉ các cột cốt lõi', 'active', 'excel_basic', 1
FROM (
  SELECT 'stations' AS entity, 'Trạm' AS label
  UNION ALL SELECT 'station_proposals', 'Đề xuất'
  UNION ALL SELECT 'users', 'Người dùng'
) e
WHERE NOT EXISTS (SELECT 1 FROM views v WHERE v.entity = e.entity AND v.`usage` = 'excel_basic');

-- ============ 2. excel_full: copy toan bo view_fields cua view 'table' ============
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT dst.id, vf.field_id, vf.order_index, vf.visible, vf.width, vf.sortable, vf.filterable, vf.config
FROM views dst
JOIN views src ON src.entity = dst.entity AND src.`usage` = 'table'
JOIN view_fields vf ON vf.view_id = src.id
WHERE dst.`usage` = 'excel_full'
  AND NOT EXISTS (SELECT 1 FROM view_fields x WHERE x.view_id = dst.id AND x.field_id = vf.field_id);

-- ============ 3. excel_basic: subset cot cot loi ============
INSERT INTO view_fields (view_id, field_id, order_index, visible, sortable, filterable)
SELECT dst.id, f.id, k.ord, 1, 0, 0
FROM views dst
JOIN (
  -- stations: 7 cot
  SELECT 'stations' AS entity, 'name' AS k, 0 AS ord
  UNION ALL SELECT 'stations', 'latitude', 1
  UNION ALL SELECT 'stations', 'longitude', 2
  UNION ALL SELECT 'stations', 'address', 3
  UNION ALL SELECT 'stations', 'province', 4
  UNION ALL SELECT 'stations', 'mo_hinh_tram', 5
  UNION ALL SELECT 'stations', 'status', 6
  -- station_proposals: 8 cot
  UNION ALL SELECT 'station_proposals', 'owner_name', 0
  UNION ALL SELECT 'station_proposals', 'owner_phone', 1
  UNION ALL SELECT 'station_proposals', 'latitude', 2
  UNION ALL SELECT 'station_proposals', 'longitude', 3
  UNION ALL SELECT 'station_proposals', 'address', 4
  UNION ALL SELECT 'station_proposals', 'province', 5
  UNION ALL SELECT 'station_proposals', 'xa_phuong', 6
  UNION ALL SELECT 'station_proposals', 'mo_hinh_dau_tu', 7
  -- users: 5 cot
  UNION ALL SELECT 'users', 'full_name', 0
  UNION ALL SELECT 'users', 'email', 1
  UNION ALL SELECT 'users', 'phone', 2
  UNION ALL SELECT 'users', 'role', 3
  UNION ALL SELECT 'users', 'department', 4
) k ON k.entity = dst.entity
JOIN field_definitions f ON f.entity = dst.entity AND f.`key` = k.k AND f.status = 'active'
WHERE dst.`usage` = 'excel_basic'
  AND NOT EXISTS (SELECT 1 FROM view_fields x WHERE x.view_id = dst.id AND x.field_id = f.id);
