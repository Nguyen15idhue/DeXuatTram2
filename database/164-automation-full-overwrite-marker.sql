-- 164: Moc full-overwrite dinh ky cho dong bo Sheet (docs/8/67-4.9).
-- Moi 2h (FULL_OVERWRITE_HOURS) luot auto se ghi de toan bo tab thay vi partial,
-- de don sach rac tich luy (o thua, header lech tay nhieu, dong stale).
-- Idempotent: chi them cot neu chua co. KHONG dung DROP.
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'work_automations' AND column_name = 'last_full_overwrite_at');
SET @s := IF(@c = 0,
  'ALTER TABLE work_automations ADD COLUMN last_full_overwrite_at DATETIME NULL',
  'SELECT ''last_full_overwrite_at exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
