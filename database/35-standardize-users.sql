-- Script 35: Chuẩn hóa Users + tạo data lists
-- Ngày: 08/09/2026

-- 1. Tạo data list dm_phong_ban
INSERT INTO data_lists (name, description, columns_config) VALUES
('dm_phong_ban', 'Danh mục phòng ban',
 '[{"key":"ma","label":"Mã","type":"text"},{"key":"ten","label":"Tên phòng ban","type":"text"}]');

SET @dl_phong_ban = LAST_INSERT_ID();

INSERT INTO data_list_rows (list_id, data) VALUES
(@dl_phong_ban, '{"ma":"KT","ten":"Kỹ thuật"}'),
(@dl_phong_ban, '{"ma":"VH","ten":"Vận hành"}'),
(@dl_phong_ban, '{"ma":"HC","ten":"Hành chính"}'),
(@dl_phong_ban, '{"ma":"KD","ten":"Kinh doanh"}'),
(@dl_phong_ban, '{"ma":"MKT","ten":"Marketing"}');

-- 2. Thêm field chuc_vu cho Users
-- field_definitions KHÔNG có cột order_index (thứ tự nằm ở form_fields.order_index)
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
VALUES ('users', 'chuc_vu', 'Chức vụ', 'text', 'json', 0, 'active');

-- 3. Link field department với dm_phong_ban
UPDATE field_definitions
SET data_list_id = @dl_phong_ban,
    data_list_column = 'ten'
WHERE `key` = 'department' AND entity = 'users';

-- 4. Kiểm tra kết quả
SELECT 'data_lists' AS tbl, id, name FROM data_lists WHERE name = 'dm_phong_ban';
SELECT 'data_list_rows' AS tbl, id, data FROM data_list_rows WHERE list_id = @dl_phong_ban;
SELECT 'field_definitions' AS tbl, id, `key`, data_list_id, data_list_column FROM field_definitions WHERE entity = 'users' AND `key` IN ('chuc_vu', 'department');
