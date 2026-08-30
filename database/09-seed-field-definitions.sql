-- -*- coding: utf-8 -*-
-- All fields from stations, users, station_proposals tables
-- source_type: 'fixed' = database column, 'json' = custom_data field

-- ==================== STATIONS ====================
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, options, placeholder) VALUES
('stations', 'name', 'Tên trạm', 'text', 'fixed', 1, NULL, 'Nhập tên trạm'),
('stations', 'latitude', 'Vĩ độ', 'number', 'fixed', 1, NULL, NULL),
('stations', 'longitude', 'Kinh độ', 'number', 'fixed', 1, NULL, NULL),
('stations', 'address', 'Địa chỉ', 'text', 'fixed', 0, NULL, 'Nhập địa chỉ'),
('stations', 'status', 'Trạng thái', 'select', 'fixed', 0, '[{"label":"ACTIVE","value":"ACTIVE"},{"label":"DEPLOYING","value":"DEPLOYING"}]', NULL),
('stations', 'description', 'Mô tả', 'textarea', 'fixed', 0, NULL, 'Mô tả trạm'),
('stations', 'antenna_height', 'Chiều cao anten', 'number', 'json', 0, NULL, 'Nhập chiều cao (m)'),
('stations', 'tower_type', 'Loại cột', 'select', 'json', 0, '[{"label":"Cột đơn","value":"Cột đơn"},{"label":"Cột đôi","value":"Cột đôi"},{"label":"Cột ba","value":"Cột ba"}]', NULL),
('stations', 'power_capacity', 'Công suất', 'number', 'json', 0, NULL, 'Nhập công suất (kW)');

-- ==================== USERS ====================
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, options, placeholder) VALUES
('users', 'full_name', 'Họ tên', 'text', 'fixed', 1, NULL, 'Nhập họ tên'),
('users', 'email', 'Email', 'email', 'fixed', 1, NULL, 'Nhập email'),
('users', 'phone', 'Số điện thoại', 'phone', 'fixed', 0, NULL, 'Nhập SĐT'),
('users', 'role', 'Vai trò', 'select', 'fixed', 0, '[{"label":"USER","value":"USER"},{"label":"ADMIN","value":"ADMIN"}]', NULL),
('users', 'status', 'Trạng thái', 'select', 'fixed', 0, '[{"label":"ACTIVE","value":"ACTIVE"},{"label":"LOCKED","value":"LOCKED"}]', NULL),
('users', 'employee_code', 'Mã nhân viên', 'text', 'json', 0, NULL, 'Nhập mã NV'),
('users', 'department', 'Phòng ban', 'select', 'json', 0, '[{"label":"Kỹ thuật","value":"Kỹ thuật"},{"label":"Vận hành","value":"Vận hành"},{"label":"Hành chính","value":"Hành chính"}]', NULL),
('users', 'avatar', 'Ảnh đại diện', 'file', 'json', 0, NULL, NULL);

-- ==================== STATION PROPOSALS ====================
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, options, placeholder) VALUES
('station_proposals', 'owner_name', 'Tên chủ sở hữu', 'text', 'fixed', 1, NULL, 'Nhập tên chủ sở hữu'),
('station_proposals', 'owner_phone', 'SĐT chủ sở hữu', 'phone', 'fixed', 1, NULL, 'Nhập SĐT'),
('station_proposals', 'latitude', 'Vĩ độ', 'number', 'fixed', 1, NULL, NULL),
('station_proposals', 'longitude', 'Kinh độ', 'number', 'fixed', 1, NULL, NULL),
('station_proposals', 'address', 'Địa chỉ', 'text', 'fixed', 0, NULL, 'Nhập địa chỉ'),
('station_proposals', 'area', 'Diện tích', 'text', 'fixed', 0, NULL, 'Nhập diện tích'),
('station_proposals', 'land_type', 'Loại đất', 'text', 'fixed', 0, NULL, 'Nhập loại đất'),
('station_proposals', 'description', 'Mô tả', 'textarea', 'fixed', 0, NULL, 'Mô tả đề xuất'),
('station_proposals', 'status', 'Trạng thái', 'select', 'fixed', 0, '[{"label":"PENDING","value":"PENDING"},{"label":"REVIEWING","value":"REVIEWING"},{"label":"APPROVED","value":"APPROVED"},{"label":"REJECTED","value":"REJECTED"}]', NULL),
('station_proposals', 'investment_cost', 'Chi phí đầu tư', 'number', 'json', 0, NULL, 'Nhập chi phí (VNĐ)'),
('station_proposals', 'legal_document', 'Hồ sơ pháp lý', 'file', 'json', 0, NULL, NULL),
('station_proposals', 'site_images', 'Hình ảnh hiện trường', 'file', 'json', 0, NULL, NULL);
