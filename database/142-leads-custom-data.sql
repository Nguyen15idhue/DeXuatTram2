-- 142: Bo sung cot custom_data cho leads (chua lich su CSKH/TVBH + field mo rong json).
-- 68 dealing 8 du kien custom_data nhung migration 134 con thieu; buoc 4.1 can de luu 4 field json.
-- Rollback: ALTER TABLE leads DROP COLUMN custom_data (chi khi chua co du lieu json can thiet).
-- Idempotent.
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'leads'
      AND column_name = 'custom_data') = 0,
  'ALTER TABLE leads ADD COLUMN custom_data JSON NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
