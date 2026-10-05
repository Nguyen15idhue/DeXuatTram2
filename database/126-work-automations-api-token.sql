-- 126: Them cot work API token cho automation (docs/8/66, Buoc 2)
-- Session web khong goi duoc /api (token_not_valid) -> can work access_token rieng de tim quy trinh.
-- Idempotent.

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'api_token_enc');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE work_automations ADD COLUMN api_token_enc TEXT NULL AFTER password_enc', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
