-- 43-add-token-version.sql
-- H19: thu hoi token khi doi mat khau (JWT ngan + token_version)
-- Chay 1 lan. Khong DROP/CREATE lai bang.

SET @has_tv := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version');
SET @add_tv := IF(@has_tv = 0, 'ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt_add_tv FROM @add_tv;
EXECUTE stmt_add_tv;
DEALLOCATE PREPARE stmt_add_tv;
