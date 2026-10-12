-- 163: Cache version + moc thay doi process cho dong bo Sheet (P1/P2, docs/8/67-4.7).
-- versionOf truoc day goi web-dialog 1Office cho tung process moi luot (61 roots)
-- + cache RAM mat khi restart. Bang nay luu vinh vien (workflow_version_id bat bien).
-- last_seen_updated de incremental skip process khong doi (so voi date_updated cua listRoots).
-- Idempotent: chi tao bang/cot neu chua co. KHONG dung DROP.
CREATE TABLE IF NOT EXISTS automation_process_versions (
  process_id VARCHAR(32) NOT NULL PRIMARY KEY,
  version VARCHAR(16) NULL,
  last_seen_updated VARCHAR(64) NULL,
  checked_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pv_checked (checked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'work_automations' AND column_name = 'last_full_sync_at');
SET @s := IF(@c = 0,
  'ALTER TABLE work_automations ADD COLUMN last_full_sync_at DATETIME NULL',
  'SELECT ''last_full_sync_at exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
