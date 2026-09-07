-- 28: Field type password cho users (file 25, Phase 2 - Buoc 2.3)
-- Quy ước dự án: SQL thủ công, không DROP TABLE, chạy lần lượt bằng tay.

-- Field password liên kết thẳng cột gốc users.password (source fixed)
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
VALUES ('users', 'password', 'Mật khẩu', 'password', 'fixed', 0, 'active');

-- Gắn vào Form Users (form_id = 8), cuối form
SET @pw_field = LAST_INSERT_ID();
SET @max_ord = (SELECT COALESCE(MAX(order_index), -1) + 1 FROM form_fields WHERE form_id = 8);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
VALUES (8, @pw_field, @max_ord, 1, NULL);
