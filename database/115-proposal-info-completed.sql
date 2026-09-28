-- 115: Co xac nhan hoan thien thong tin de xuat (info_completed_at)
-- 1. Them cot info_completed_at (DATETIME NULL) cho station_proposals (NULL = chua xac nhan).
-- 2. Backfill: toan bo record hien tai coi nhu da hoan thien (khong bao qua han nua).
-- Idempotent.

-- ============ 1. Cot info_completed_at (guard information_schema) ============
SET @has_completed := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'info_completed_at'
);
SET @sql_completed := IF(@has_completed = 0,
'ALTER TABLE station_proposals ADD COLUMN info_completed_at DATETIME NULL AFTER supplement_deadline_at',
'SELECT ''column info_completed_at already exists'' AS info');
PREPARE stmt_completed FROM @sql_completed;
EXECUTE stmt_completed;
DEALLOCATE PREPARE stmt_completed;

-- ============ 2. Backfill record cu: da hoan thien du thong tin ============
UPDATE station_proposals
   SET info_completed_at = NOW()
 WHERE info_completed_at IS NULL;

SELECT 'info_completed_backfill' AS metric,
  COUNT(*) AS total,
  SUM(CASE WHEN info_completed_at IS NULL THEN 1 ELSE 0 END) AS still_null
FROM station_proposals;
