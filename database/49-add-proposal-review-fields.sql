-- Script 49: Them truong review (ly do tu choi, nguoi duyet, thoi diem) vao station_proposals
-- Ngay: 11/09/2026
-- Muc tieu: luu ly do tu choi de thong bao nguoc lai CTV + yeu cau chinh sua
-- Idempotent: chi them cot neu chua co. KHONG dung DROP.

-- reject_reason
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND column_name = 'reject_reason');
SET @s := IF(@c = 0,
  'ALTER TABLE station_proposals ADD COLUMN reject_reason TEXT NULL AFTER status',
  'SELECT ''reject_reason exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- reviewed_by
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND column_name = 'reviewed_by');
SET @s := IF(@c = 0,
  'ALTER TABLE station_proposals ADD COLUMN reviewed_by INT NULL AFTER reject_reason',
  'SELECT ''reviewed_by exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- reviewed_at
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND column_name = 'reviewed_at');
SET @s := IF(@c = 0,
  'ALTER TABLE station_proposals ADD COLUMN reviewed_at TIMESTAMP NULL AFTER reviewed_by',
  'SELECT ''reviewed_at exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Verify
SELECT 'station_proposals_review_cols' AS tbl, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'station_proposals'
  AND column_name IN ('reject_reason','reviewed_by','reviewed_at')
ORDER BY ORDINAL_POSITION;
