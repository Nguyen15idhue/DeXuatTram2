-- 133: Countdown "chuyen trang thai" (transition_deadline_at) chay SONG SONG voi "bo sung thong tin".
-- Moi trang thai co the cau hinh 2 moc:
--   - supplement: qua han chua xac nhan du thong tin -> huy de xuat.
--   - transition: qua han chua chuyen sang trang thai tiep theo -> huy de xuat.
-- Idempotent.

SET @has_trans := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'transition_deadline_at'
);
SET @sql_trans := IF(@has_trans = 0,
  'ALTER TABLE station_proposals ADD COLUMN transition_deadline_at DATETIME NULL AFTER supplement_deadline_at',
  'SELECT ''column transition_deadline_at already exists'' AS info');
PREPARE stmt_trans FROM @sql_trans;
EXECUTE stmt_trans;
DEALLOCATE PREPARE stmt_trans;

SELECT 'transition_deadline_at' AS metric, COUNT(*) AS total
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'transition_deadline_at';
