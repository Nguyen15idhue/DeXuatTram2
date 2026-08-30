INSERT INTO field_definitions (entity, `key`, label, type, source_type, required) VALUES
('stations', 'antenna_height', 'Chiều cao anten', 'number', 'json', 0),
('stations', 'tower_type', 'Loại cột', 'select', 'json', 0),
('stations', 'power_capacity', 'Công suất', 'number', 'json', 0);

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required) VALUES
('station_proposals', 'investment_cost', 'Chi phí đầu tư', 'number', 'json', 0),
('station_proposals', 'legal_document', 'Hồ sơ pháp lý', 'file', 'json', 0),
('station_proposals', 'site_images', 'Hình ảnh hiện trường', 'file', 'json', 0);

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required) VALUES
('users', 'employee_code', 'Mã nhân viên', 'text', 'json', 0),
('users', 'department', 'Phòng ban', 'select', 'json', 0),
('users', 'avatar', 'Ảnh đại diện', 'file', 'json', 0);
