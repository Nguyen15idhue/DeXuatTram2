-- 27: RBAC 5 roles + parent_id + external_id (file 25, Phase 1)
-- Quy ước dự án: SQL thủ công, không DROP TABLE, chạy lần lượt bằng tay.

-- Bước 1: mở rộng ENUM tạm (giữ USER cũ để MODIFY không lỗi dữ liệu hiện tại)
ALTER TABLE users MODIFY COLUMN role ENUM('SUPER_ADMIN','ADMIN','SALES','CTV','USER') NULL DEFAULT 'USER';

-- Bước 2: thêm cột phân cấp + mapping hệ ngoài
ALTER TABLE users ADD COLUMN parent_id INT NULL AFTER status;
ALTER TABLE users ADD COLUMN external_id VARCHAR(100) NULL UNIQUE AFTER parent_id;
ALTER TABLE users ADD CONSTRAINT fk_users_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_users_parent ON users(parent_id);

-- Bước 3: migrate dữ liệu cũ (USER -> CTV)
UPDATE users SET role = 'CTV' WHERE role = 'USER';

-- Bước 4: seed SUPER_ADMIN duy nhất (user đã duyệt: admin@station.com)
UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'admin@station.com';

-- Bước 5: chốt ENUM cuối (bỏ USER)
ALTER TABLE users MODIFY COLUMN role ENUM('SUPER_ADMIN','ADMIN','SALES','CTV') NULL DEFAULT 'CTV';

-- Bước 6: đồng bộ options role trong Form Users (form_id = 8) theo role mới
UPDATE field_definitions SET options = '[{"label": "SUPER_ADMIN", "value": "SUPER_ADMIN"}, {"label": "ADMIN", "value": "ADMIN"}, {"label": "SALES", "value": "SALES"}, {"label": "CTV", "value": "CTV"}]', updated_at = NOW() WHERE id = 44;
