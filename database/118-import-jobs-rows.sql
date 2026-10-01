-- 118: Them cot rows cho import_jobs (docs/8/63, phan 2)
-- Worker can payload dong (fixedData/dynamicData) de xu ly nen.
-- Idempotent.

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'import_jobs'
    AND COLUMN_NAME = 'rows'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE import_jobs ADD COLUMN `rows` LONGTEXT NULL AFTER `columns`',
  'SELECT ''Column rows already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
