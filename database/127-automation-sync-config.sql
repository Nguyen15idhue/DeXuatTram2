-- 127: Them cot cau hinh sync Sheet cho automation (docs/8/67, Buoc 1)
-- Idempotent.

SET @c1 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'spreadsheet_id');
SET @d1 = IF(@c1 = 0, 'ALTER TABLE work_automations ADD COLUMN spreadsheet_id VARCHAR(128) NULL AFTER note', 'SELECT 1');
PREPARE s1 FROM @d1;
EXECUTE s1;
DEALLOCATE PREPARE s1;

SET @c2 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'sheet_mode');
SET @d2 = IF(@c2 = 0, 'ALTER TABLE work_automations ADD COLUMN sheet_mode VARCHAR(16) NOT NULL DEFAULT ''per_version'' AFTER spreadsheet_id', 'SELECT 1');
PREPARE s2 FROM @d2;
EXECUTE s2;
DEALLOCATE PREPARE s2;

SET @c3 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'frequency_min');
SET @d3 = IF(@c3 = 0, 'ALTER TABLE work_automations ADD COLUMN frequency_min INT NOT NULL DEFAULT 15 AFTER sheet_mode', 'SELECT 1');
PREPARE s3 FROM @d3;
EXECUTE s3;
DEALLOCATE PREPARE s3;

SET @c4 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'write_mode');
SET @d4 = IF(@c4 = 0, 'ALTER TABLE work_automations ADD COLUMN write_mode VARCHAR(16) NOT NULL DEFAULT ''upsert'' AFTER frequency_min', 'SELECT 1');
PREPARE s4 FROM @d4;
EXECUTE s4;
DEALLOCATE PREPARE s4;

SET @c5 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'sa_email');
SET @d5 = IF(@c5 = 0, 'ALTER TABLE work_automations ADD COLUMN sa_email VARCHAR(255) NULL AFTER write_mode', 'SELECT 1');
PREPARE s5 FROM @d5;
EXECUTE s5;
DEALLOCATE PREPARE s5;

SET @c6 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_automations' AND COLUMN_NAME = 'last_run_at');
SET @d6 = IF(@c6 = 0, 'ALTER TABLE work_automations ADD COLUMN last_run_at TIMESTAMP NULL AFTER sa_email', 'SELECT 1');
PREPARE s6 FROM @d6;
EXECUTE s6;
DEALLOCATE PREPARE s6;
