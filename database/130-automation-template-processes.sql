-- 129: Add template_process_ids column to work_automations for sync_process_report
-- Idempotent.

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'template_process_ids');
SET @ddl = IF(@c = 0, 'ALTER TABLE work_automations ADD COLUMN template_process_ids JSON NULL AFTER note', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;