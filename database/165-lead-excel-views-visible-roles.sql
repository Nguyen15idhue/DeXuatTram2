-- 165: seed Excel views cho leads + phan quyen template theo role.
-- 1. Them cot views.visible_roles (JSON, NULL = moi role deu thay).
-- 2. Seed 'excel_full' cho leads (copy view_fields cua view table, khoa xoa).
--    'excel_basic' chi seed khi chua co (local dev da co view 'Import leads'
--    do UI tao - migration 155 - thi giu nguyen, khong danh vao cau hinh tay).
-- 3. excel_full cua leads chi hien voi SUPER_ADMIN/ADMIN/SALES (MKT chi thay
--    Excel Tao nhanh); excel_basic de NULL (= tat ca role).
-- Idempotent.

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'views' AND COLUMN_NAME = 'visible_roles');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE views ADD COLUMN visible_roles JSON NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO views (entity, name, description, status, `usage`, is_locked)
SELECT 'leads', 'Excel Lead - đầy đủ', 'Toàn bộ cột như view bảng', 'active', 'excel_full', 1
WHERE NOT EXISTS (SELECT 1 FROM views WHERE entity = 'leads' AND `usage` = 'excel_full');

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT dst.id, vf.field_id, vf.order_index, vf.visible, vf.width, vf.sortable, vf.filterable, vf.config
FROM views dst
JOIN views src ON src.entity = 'leads' AND src.`usage` = 'table'
JOIN view_fields vf ON vf.view_id = src.id
WHERE dst.entity = 'leads' AND dst.`usage` = 'excel_full'
  AND NOT EXISTS (SELECT 1 FROM view_fields x WHERE x.view_id = dst.id AND x.field_id = vf.field_id);

INSERT INTO views (entity, name, description, status, `usage`, is_locked)
SELECT 'leads', 'Excel Lead - Tạo nhanh', 'Chỉ các cột cốt lõi', 'active', 'excel_basic', 1
WHERE NOT EXISTS (SELECT 1 FROM views WHERE entity = 'leads' AND `usage` = 'excel_basic');

INSERT INTO view_fields (view_id, field_id, order_index, visible, sortable, filterable)
SELECT dst.id, f.id, k.ord, 1, 0, 0
FROM views dst
JOIN (
  SELECT 'full_name' AS k, 0 AS ord
  UNION ALL SELECT 'phone', 1
  UNION ALL SELECT 'email', 2
  UNION ALL SELECT 'province', 3
  UNION ALL SELECT 'ward', 4
  UNION ALL SELECT 'address', 5
  UNION ALL SELECT 'customer_type', 6
  UNION ALL SELECT 'source', 7
  UNION ALL SELECT 'note', 8
) k
JOIN field_definitions f ON f.entity = 'leads' AND f.`key` = k.k AND f.status = 'active'
WHERE dst.entity = 'leads' AND dst.`usage` = 'excel_basic'
  AND NOT EXISTS (SELECT 1 FROM view_fields x WHERE x.view_id = dst.id AND x.field_id = f.id);

UPDATE views SET visible_roles = '["SUPER_ADMIN", "ADMIN", "SALES"]'
WHERE entity = 'leads' AND `usage` = 'excel_full';
