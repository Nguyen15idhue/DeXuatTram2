-- 78: Metadata cho forms/views (nhieu ban moi entity + khoa + mac dinh)
--   views.`usage`      : table | excel_full | excel_basic  (USAGE la tu khoa reserved -> phai backtick)
--   views.is_locked    : 1 = khong cho xoa (van sua duoc + doi status)
--   forms.is_locked    : 1 = khong cho xoa
--   forms.is_default   : form mac dinh khi resolve theo purpose
-- Idempotent (guard bang information_schema), khong DROP.

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'views' AND column_name = 'usage') = 0,
  'ALTER TABLE views ADD COLUMN `usage` VARCHAR(30) NOT NULL DEFAULT ''table''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'views' AND column_name = 'is_locked') = 0,
  'ALTER TABLE views ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'forms' AND column_name = 'is_locked') = 0,
  'ALTER TABLE forms ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'forms' AND column_name = 'is_default') = 0,
  'ALTER TABLE forms ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed: 3 view bang danh sach hien tai = `usage` 'table' + khoa
UPDATE views SET `usage` = 'table', is_locked = 1 WHERE id IN (6, 7, 8);

-- Seed: 6 form hien tai = khoa
UPDATE forms SET is_locked = 1 WHERE id IN (10, 12, 13, 14, 15, 16);

-- Seed: form 'create' hien tai = mac dinh (de resolve theo purpose khong ngau nhien)
UPDATE forms SET is_default = 1 WHERE id IN (12, 13, 15);

SELECT 'views_meta' AS metric, id, entity, `usage`, is_locked, status FROM views ORDER BY id;
SELECT 'forms_meta' AS metric, id, entity, purpose, is_locked, is_default, status FROM forms ORDER BY id;
