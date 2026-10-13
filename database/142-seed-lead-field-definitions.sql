-- 140: Seed field_definitions cho entity leads (3 section: Marketing / CSKH / TVBH).
-- Ke hoach 68 (section 14) + buoc 3.2 file 69.
-- Tinh/Phuong cascading: province -> datalist Tinh (cot ten_tinh); ward -> datalist
-- 'Danh mục Phường Xã' (cot xa, parent_field tinh).
-- => Tra cuu data_list_id THEO TEN (portable dev/VPS; id datalist khac nhau giua moi truong).
-- Cot thoi_gian trong 2 bang lich su co default_formula NOW() (buoc 3.4 se hien thuc generic).
-- Idempotent. Khong sua field cua entity khac.

SET @tinh_dl = (SELECT id FROM data_lists WHERE name IN ('Tỉnh', 'dm_tinh') ORDER BY (name = 'Tỉnh') DESC, id ASC LIMIT 1);
SET @xa_dl = (
  SELECT id FROM data_lists
  WHERE name IN ('Danh mục Phường Xã', 'Danh muc Phuong Xa', 'Xã', 'dm_xa')
    AND JSON_SEARCH(columns_config, 'one', 'tinh') IS NOT NULL
  ORDER BY FIELD(name, 'Danh mục Phường Xã', 'Danh muc Phuong Xa', 'Xã', 'dm_xa'), id ASC
  LIMIT 1
);
SET @ctype_dl = (SELECT id FROM data_lists WHERE name = 'MKT Lead Customer Type' LIMIT 1);
SET @source_dl = (SELECT id FROM data_lists WHERE name = 'MKT Lead Source' LIMIT 1);
SET @class_dl = (SELECT id FROM data_lists WHERE name = 'MKT Lead Customer Classification' LIMIT 1);
SET @cskh_dl = (SELECT id FROM data_lists WHERE name = 'MKT Lead CSKH Contact Status' LIMIT 1);
SET @tvbh_dl = (SELECT id FROM data_lists WHERE name = 'MKT Lead TVBH Status' LIMIT 1);

-- ============ Section 1: Marketing (fixed = cot DB leads) ============
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, placeholder, status)
SELECT 'leads', 'lead_code', 'Mã Lead', 'text', 'fixed', 0, 'Tự sinh khi tạo', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'lead_code');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'leads', 'full_name', 'Họ và tên', 'text', 'fixed', 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'full_name');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, placeholder, status)
SELECT 'leads', 'phone', 'Số điện thoại', 'phone', 'fixed', 1, '10 số, bắt đầu bằng 0', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'phone');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'leads', 'email', 'Email', 'email', 'fixed', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'email');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, status)
SELECT 'leads', 'province', 'Tỉnh/Thành phố', 'select', 'fixed', 1, @tinh_dl, 'ten_tinh', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'province');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, parent_field, status)
SELECT 'leads', 'ward', 'Phường/Xã', 'select', 'fixed', 0, @xa_dl, 'xa', 'tinh', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'ward');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'leads', 'address', 'Địa chỉ', 'textarea', 'fixed', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'address');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, status)
SELECT 'leads', 'customer_type', 'Đối tượng khách hàng', 'select', 'fixed', 0, @ctype_dl, 'value', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'customer_type');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, status)
SELECT 'leads', 'source', 'Nguồn Lead', 'select', 'fixed', 0, @source_dl, 'value', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'source');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'leads', 'note', 'Ghi chú', 'textarea', 'fixed', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'note');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'leads', 'region', 'Vùng miền', 'text', 'fixed', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'region');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, `options`, status)
SELECT 'leads', 'stage', 'Giai đoạn', 'select', 'fixed', 0,
'[{"value":"NEW","label":"Mới","color":"#6b7280"},{"value":"ASSIGNED","label":"Đã giao","color":"#3b82f6"},{"value":"CSKH","label":"CSKH","color":"#06b6d4"},{"value":"QUALIFIED","label":"Đạt chuẩn","color":"#14b8a6"},{"value":"TVBH","label":"TVBH","color":"#8b5cf6"},{"value":"PROPOSAL","label":"Đề xuất","color":"#f59e0b"},{"value":"STATION","label":"Trạm","color":"#22c55e"},{"value":"ON","label":"ON trạm","color":"#166534"},{"value":"UNQUALIFIED","label":"Không đạt chuẩn","color":"#9ca3af"},{"value":"LOST","label":"Mất","color":"#ef4444"}]',
'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'stage');

-- ============ Section 2: CSKH ============
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, source_config, status)
SELECT 'leads', 'cskh_history', 'Lịch sử CSKH', 'table', 'json', 0,
CONCAT('{"columns": [{"key": "thoi_gian", "label": "Thời gian", "width": 180, "column_type": "datetime", "default_formula": "NOW()"}, {"key": "tinh_trang", "label": "Tình trạng liên hệ", "width": 260, "column_type": "select", "data_list_id": ', IFNULL(@cskh_dl, 'NULL'), ', "data_list_column": "value"}, {"key": "ghi_chu", "label": "Ghi chú", "width": 260, "column_type": "text"}], "max_rows": 3, "min_rows": 0}'),
'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'cskh_history');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, status)
SELECT 'leads', 'customer_classification', 'Phân loại khách hàng', 'select', 'fixed', 0, @class_dl, 'value', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'customer_classification');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'leads', 'cskh_note', 'Ghi chú CSKH', 'textarea', 'json', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'cskh_note');

-- ============ Section 3: TVBH ============
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, source_config, status)
SELECT 'leads', 'tvbh_history', 'Lịch sử TVBH', 'table', 'json', 0,
CONCAT('{"columns": [{"key": "thoi_gian", "label": "Thời gian", "width": 180, "column_type": "datetime", "default_formula": "NOW()"}, {"key": "tinh_trang", "label": "Tình trạng TVBH", "width": 220, "column_type": "select", "data_list_id": ', IFNULL(@tvbh_dl, 'NULL'), ', "data_list_column": "value"}, {"key": "ghi_chu", "label": "Ghi chú", "width": 260, "column_type": "text"}], "max_rows": 3, "min_rows": 0}'),
'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'tvbh_history');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, `options`, status)
SELECT 'leads', 'sales_outcome', 'Kết quả TVBH', 'select', 'fixed', 0,
'[{"value":"SUCCESS","label":"Thành công","color":"#22c55e"},{"value":"FAILED","label":"Không thành công","color":"#ef4444"}]',
'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'sales_outcome');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'leads', 'tvbh_note', 'Ghi chú TVBH', 'textarea', 'json', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'tvbh_note');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'leads', 'assigned_user_id', 'Người phụ trách', 'user', 'fixed', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'assigned_user_id');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'leads', 'assigned_department', 'Phòng ban phụ trách', 'text', 'fixed', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'assigned_department');

-- ============ Dong bo data_list_id theo ten (fix ban ghi da tao voi id sai) ============
UPDATE field_definitions SET data_list_id = @tinh_dl WHERE entity = 'leads' AND `key` = 'province' AND @tinh_dl IS NOT NULL;
UPDATE field_definitions SET data_list_id = @xa_dl WHERE entity = 'leads' AND `key` = 'ward' AND @xa_dl IS NOT NULL;
UPDATE field_definitions SET data_list_id = @ctype_dl WHERE entity = 'leads' AND `key` = 'customer_type' AND @ctype_dl IS NOT NULL;
UPDATE field_definitions SET data_list_id = @source_dl WHERE entity = 'leads' AND `key` = 'source' AND @source_dl IS NOT NULL;
UPDATE field_definitions SET data_list_id = @class_dl WHERE entity = 'leads' AND `key` = 'customer_classification' AND @class_dl IS NOT NULL;
