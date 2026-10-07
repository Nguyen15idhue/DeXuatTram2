-- 131: Tach "loai automation" khoi "ban ghi" (work_automations)
-- automation_type = 'assign_process' (gan quy trinh vao du an) | 'sync_sheet' (dong bo Google Sheet)
-- Cho phep nhieu automation cung 1 loai. Idempotent.

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'automation_type');
SET @ddl = IF(@c = 0, 'ALTER TABLE work_automations ADD COLUMN automation_type VARCHAR(50) NULL AFTER automation_key', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE work_automations SET automation_type = 'assign_process' WHERE automation_key = 'auto_assign_process' AND (automation_type IS NULL OR automation_type = '');
UPDATE work_automations SET automation_type = 'sync_sheet' WHERE automation_key = 'sync_process_report' AND (automation_type IS NULL OR automation_type = '');
UPDATE work_automations SET automation_type = 'sync_sheet' WHERE automation_type IS NULL OR automation_type = '';
