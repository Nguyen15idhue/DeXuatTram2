-- 158: them cot views.frozen_columns (so cot dau dong bang khi cuon ngang, mac dinh 2 gom STT).
-- Idempotent: bo qua neu cot da ton tai (cho phep chay lai an toan).
SET @frozen_col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'views' AND COLUMN_NAME = 'frozen_columns'
);
SET @frozen_ddl := IF(@frozen_col_exists = 0,
  'ALTER TABLE views ADD COLUMN frozen_columns INT NOT NULL DEFAULT 2',
  'SELECT 1');
PREPARE frozen_stmt FROM @frozen_ddl;
EXECUTE frozen_stmt;
DEALLOCATE PREPARE frozen_stmt;
UPDATE views SET frozen_columns = 2 WHERE frozen_columns IS NULL;
