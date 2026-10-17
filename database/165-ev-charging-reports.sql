-- 165-ev-charging-reports.sql
-- Ke hoach 78 (form khach chia se diem sac xe dien, nac danh): bang ev_charging_reports
-- + field_definitions + 2 forms (all khach / view noi bo) + 1 view table.
-- Quyet dinh: SDT bat buoc o UI + validator nhung cot DB NULLABLE (sau nay noi
-- long khong can migration). 1 SDT gui duoc nhieu record (khong unique).
-- Idempotent. Khong sua entity khac. Khong DROP/CREATE lai.

CREATE TABLE IF NOT EXISTS ev_charging_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  address TEXT NULL,
  province VARCHAR(150) NULL,
  ward VARCHAR(150) NULL,
  province_code VARCHAR(20) NULL,
  custom_data JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_evreports_phone_created (phone, created_at),
  KEY idx_evreports_province_created (province, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tra cuu data_list dia gioi THEO TEN (portable dev/VPS, mau migration 142)
SET @xa_dl = (
  SELECT id FROM data_lists
  WHERE name IN ('Danh mục Phường Xã', 'Danh muc Phuong Xa', 'Xã', 'dm_xa')
    AND JSON_SEARCH(columns_config, 'one', 'tinh') IS NOT NULL
  ORDER BY FIELD(name, 'Danh mục Phường Xã', 'Danh muc Phuong Xa', 'Xã', 'dm_xa'), id ASC
  LIMIT 1
);

-- ============ field_definitions (entity ev_charging_reports) ============
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, placeholder, status)
SELECT 'ev_charging_reports', 'full_name', 'Họ và tên', 'text', 'fixed', 1, 'Tên người chia sẻ', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'ev_charging_reports' AND `key` = 'full_name');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, placeholder, status)
SELECT 'ev_charging_reports', 'phone', 'Số điện thoại', 'phone', 'fixed', 1, '10 số, bắt đầu bằng 0', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'ev_charging_reports' AND `key` = 'phone');

INSERT INTO field_definitions (
    entity, `key`, label, type, source_type,
    required, `options`, status
)
SELECT
    'ev_charging_reports',
    'hang_xe',
    'Hãng xe đang sử dụng',
    'select',
    'json',
    1,
    NULL,
    'active'
WHERE NOT EXISTS (
    SELECT 1
    FROM field_definitions
    WHERE entity = 'ev_charging_reports'
      AND `key` = 'hang_xe'
);

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, status)
SELECT 'ev_charging_reports', 'province', 'Tỉnh/Thành phố', 'select', 'fixed', 1, @xa_dl, 'tinh', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'ev_charging_reports' AND `key` = 'province');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, parent_field, status)
SELECT 'ev_charging_reports', 'ward', 'Phường/Xã', 'select', 'fixed', 0, @xa_dl, 'xa', 'tinh', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'ev_charging_reports' AND `key` = 'ward');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, placeholder, status)
SELECT 'ev_charging_reports', 'address', 'Địa chỉ chi tiết', 'textarea', 'fixed', 0, 'Số nhà, đường (không bắt buộc)', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'ev_charging_reports' AND `key` = 'address');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, placeholder, status)
SELECT 'ev_charging_reports', 'latitude', 'Vĩ độ', 'number', 'fixed', 0, 'Tự điền từ bản đồ', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'ev_charging_reports' AND `key` = 'latitude');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, placeholder, status)
SELECT 'ev_charging_reports', 'longitude', 'Kinh độ', 'number', 'fixed', 0, 'Tự điền từ bản đồ', 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'ev_charging_reports' AND `key` = 'longitude');

-- ============ Form khach GPS (purpose create, mac dinh: vi tri truoc) ============
INSERT INTO forms (entity, name, description, status, layout_config, purpose, is_locked, is_default)
SELECT 'ev_charging_reports', 'Chia sẻ điểm sạc - GPS', 'Form khách chế độ vị trí hiện tại: vị trí trước, thông tin sau', 'active',
'{"sections": [{"id": "evr_gps_s1", "title": "Vị trí thường xuyên sạc", "collapsible": false, "rows": [{"id": "evr_gps_s1_r1", "columns": "1:2"}, {"id": "evr_gps_s1_r2", "columns": "1:1"}]}, {"id": "evr_gps_s2", "title": "Thông tin chia sẻ", "collapsible": false, "rows": [{"id": "evr_gps_s2_r1", "columns": "1:2"}, {"id": "evr_gps_s2_r2", "columns": "1:1"}]}]}',
'create', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity = 'ev_charging_reports' AND purpose = 'create' AND name = 'Chia sẻ điểm sạc - GPS');
SET @evr_gps_id = (SELECT id FROM forms WHERE entity = 'ev_charging_reports' AND purpose = 'create' AND name = 'Chia sẻ điểm sạc - GPS' LIMIT 1);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_gps_id, fd.id, 0, 1, '{"rowId":"evr_gps_s1_r1","colIndex":0,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'province'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_gps_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_gps_id, fd.id, 1, 1, '{"rowId":"evr_gps_s1_r1","colIndex":1,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'ward'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_gps_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_gps_id, fd.id, 2, 1, '{"rowId":"evr_gps_s1_r2","colIndex":0,"rowIndex":1,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'address'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_gps_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_gps_id, fd.id, 3, 1, '{"rowId":"evr_gps_s2_r1","colIndex":0,"rowIndex":3,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'full_name'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_gps_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_gps_id, fd.id, 4, 1, '{"rowId":"evr_gps_s2_r1","colIndex":1,"rowIndex":3,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'phone'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_gps_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_gps_id, fd.id, 5, 1, '{"rowId":"evr_gps_s2_r2","colIndex":0,"rowIndex":4,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'hang_xe'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_gps_id AND ff.field_id = fd.id);

-- ============ Form khach nhap tay (purpose all: thong tin truoc) ============
INSERT INTO forms (entity, name, description, status, layout_config, purpose, is_locked, is_default)
SELECT 'ev_charging_reports', 'Chia sẻ điểm sạc - Nhập tay', 'Form khách chế độ nhập địa chỉ: thông tin trước, vị trí sau', 'active',
'{"sections": [{"id": "evr_man_s1", "title": "Thông tin chia sẻ", "collapsible": false, "rows": [{"id": "evr_man_s1_r1", "columns": "1:2"}, {"id": "evr_man_s1_r2", "columns": "1:1"}]}, {"id": "evr_man_s2", "title": "Vị trí thường xuyên sạc", "collapsible": false, "rows": [{"id": "evr_man_s2_r1", "columns": "1:2"}, {"id": "evr_man_s2_r2", "columns": "1:1"}]}]}',
'all', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity = 'ev_charging_reports' AND purpose = 'all' AND name = 'Chia sẻ điểm sạc - Nhập tay');
SET @evr_man_id = (SELECT id FROM forms WHERE entity = 'ev_charging_reports' AND purpose = 'all' AND name = 'Chia sẻ điểm sạc - Nhập tay' LIMIT 1);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_man_id, fd.id, 0, 1, '{"rowId":"evr_man_s1_r1","colIndex":0,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'full_name'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_man_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_man_id, fd.id, 1, 1, '{"rowId":"evr_man_s1_r1","colIndex":1,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'phone'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_man_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_man_id, fd.id, 2, 1, '{"rowId":"evr_man_s1_r2","colIndex":0,"rowIndex":1,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'hang_xe'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_man_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_man_id, fd.id, 3, 1, '{"rowId":"evr_man_s2_r1","colIndex":0,"rowIndex":2,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'province'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_man_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_man_id, fd.id, 4, 1, '{"rowId":"evr_man_s2_r1","colIndex":1,"rowIndex":2,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'ward'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_man_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_man_id, fd.id, 5, 1, '{"rowId":"evr_man_s2_r2","colIndex":0,"rowIndex":3,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'address'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_man_id AND ff.field_id = fd.id);

-- ============ Form noi bo (purpose view) ============
INSERT INTO forms (entity, name, description, status, layout_config, purpose, is_locked, is_default)
SELECT 'ev_charging_reports', 'Điểm sạc - Xem / sửa', 'Form nội bộ xem/sửa + verify/spam', 'active',
'{"sections": [{"id": "evr_view_s1", "title": "Thông tin chia sẻ", "collapsible": false, "rows": [{"id": "evr_view_s1_r1", "columns": "1:2"}, {"id": "evr_view_s1_r2", "columns": "1:2"}, {"id": "evr_view_s1_r3", "columns": "1:2"}, {"id": "evr_view_s1_r4", "columns": "1:2"}]}]}',
'view', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity = 'ev_charging_reports' AND purpose = 'view' AND name = 'Điểm sạc - Xem / sửa');
SET @evr_view_id = (SELECT id FROM forms WHERE entity = 'ev_charging_reports' AND purpose = 'view' AND name = 'Điểm sạc - Xem / sửa' LIMIT 1);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, fd.id, 0, 1, '{"rowId":"evr_view_s1_r1","colIndex":0,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'full_name'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, fd.id, 1, 1, '{"rowId":"evr_view_s1_r1","colIndex":1,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'phone'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, fd.id, 2, 1, '{"rowId":"evr_view_s1_r2","colIndex":0,"rowIndex":1,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'hang_xe'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, fd.id, 3, 1, '{"rowId":"evr_view_s1_r2","colIndex":1,"rowIndex":1,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'province'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, fd.id, 4, 1, '{"rowId":"evr_view_s1_r3","colIndex":0,"rowIndex":2,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'ward'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, fd.id, 5, 1, '{"rowId":"evr_view_s1_r3","colIndex":1,"rowIndex":2,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'address'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, fd.id, 6, 1, '{"rowId":"evr_view_s1_r4","colIndex":0,"rowIndex":3,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'latitude'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, fd.id, 7, 1, '{"rowId":"evr_view_s1_r4","colIndex":1,"rowIndex":3,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'longitude'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = fd.id);

-- ============ View Bang (usage table) ============
INSERT INTO views (entity, name, description, status, `usage`, is_locked)
SELECT 'ev_charging_reports', 'Bảng điểm sạc', 'Bảng danh sách vị trí sạc do khách chia sẻ', 'active', 'table', 1
WHERE NOT EXISTS (SELECT 1 FROM views WHERE entity = 'ev_charging_reports' AND `usage` = 'table' AND name = 'Bảng điểm sạc');
SET @evr_view_tbl = (SELECT id FROM views WHERE entity = 'ev_charging_reports' AND `usage` = 'table' AND name = 'Bảng điểm sạc' LIMIT 1);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @evr_view_tbl, fd.id, 0, 1, 160, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'full_name'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @evr_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @evr_view_tbl, fd.id, 1, 1, 130, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'phone'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @evr_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @evr_view_tbl, fd.id, 2, 1, 130, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'hang_xe'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @evr_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @evr_view_tbl, fd.id, 3, 1, 130, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'province'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @evr_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @evr_view_tbl, fd.id, 4, 1, 130, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'ward'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @evr_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @evr_view_tbl, fd.id, 5, 1, 200, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'ev_charging_reports' AND fd.`key` = 'address'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @evr_view_tbl AND vf.field_id = fd.id);
