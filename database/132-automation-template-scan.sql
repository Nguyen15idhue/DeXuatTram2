-- 132: Template scan cron cho sync_sheet automations
-- template_scan_hours: chu ky quet quy trinh mau (mac dinh 24h)
-- last_template_scan_at: lan quet gan nhat
-- Idempotent.

SET @c1 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'template_scan_hours');
SET @ddl1 = IF(@c1 = 0, 'ALTER TABLE work_automations ADD COLUMN template_scan_hours INT DEFAULT 24 AFTER frequency_min', 'SELECT 1');
PREPARE stmt1 FROM @ddl1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @c2 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'last_template_scan_at');
SET @ddl2 = IF(@c2 = 0, 'ALTER TABLE work_automations ADD COLUMN last_template_scan_at DATETIME NULL AFTER last_run_at', 'SELECT 1');
PREPARE stmt2 FROM @ddl2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;