-- 97: Han bo sung thong tin de xuat (countdown PENDING/REVIEWING/PRINCIPLE_APPROVED)
-- 1. Them cot supplement_deadline_at (DATETIME NULL) cho station_proposals
-- 2. Seed cau hinh: review_supplement_days (X1), principle_supplement_days (X2),
--    supplement_webhook_url (trong = tat)
-- Idempotent.

-- ============ 1. Cot deadline (guard information_schema) ============
SET @has_deadline := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'supplement_deadline_at'
);
SET @sql_deadline := IF(@has_deadline = 0,
'ALTER TABLE station_proposals ADD COLUMN supplement_deadline_at DATETIME NULL AFTER station_id',
'SELECT ''column supplement_deadline_at already exists'' AS info');
PREPARE stmt_deadline FROM @sql_deadline;
EXECUTE stmt_deadline;
DEALLOCATE PREPARE stmt_deadline;

-- ============ 2. Seed config (khong ghi de gia tri da co) ============
INSERT INTO proposal_lifecycle_configs (`key`, `value`) VALUES
  ('review_supplement_days', '7'),
  ('principle_supplement_days', '7'),
  ('supplement_webhook_url', '')
ON DUPLICATE KEY UPDATE `value` = `value`;
