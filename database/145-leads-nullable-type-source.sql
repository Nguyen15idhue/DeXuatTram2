-- 143: Cho phep customer_type/source NULL (form tao Lead de tuy chon; service giu NULL thay vi chuoi rong).
-- Buoc 4.1. Idempotent.
SET @sql = IF(
  (SELECT IS_NULLABLE FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'leads'
      AND column_name = 'customer_type') = 'NO',
  'ALTER TABLE leads MODIFY COLUMN customer_type VARCHAR(100) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(
  (SELECT IS_NULLABLE FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'leads'
      AND column_name = 'source') = 'NO',
  'ALTER TABLE leads MODIFY COLUMN source VARCHAR(100) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
