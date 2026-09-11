-- Script 47: Them phan loai API (api_type) + cau hinh dong bo vao api_configs
-- Ngay: 11/09/2026
-- Muc tieu: phan biet API lien he (contact) vs nhan su (personnel); cau hinh sync tay/cron
-- Idempotent: chi them cot neu chua co. KHONG dung DROP.

-- api_type
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'api_configs' AND column_name = 'api_type');
SET @s := IF(@c = 0,
  'ALTER TABLE api_configs ADD COLUMN api_type ENUM(''contact'',''personnel'') NOT NULL DEFAULT ''contact'' AFTER system_key',
  'SELECT ''api_type exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- sync_enabled
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'api_configs' AND column_name = 'sync_enabled');
SET @s := IF(@c = 0,
  'ALTER TABLE api_configs ADD COLUMN sync_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER api_type',
  'SELECT ''sync_enabled exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- sync_cron
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'api_configs' AND column_name = 'sync_cron');
SET @s := IF(@c = 0,
  'ALTER TABLE api_configs ADD COLUMN sync_cron VARCHAR(100) NULL AFTER sync_enabled',
  'SELECT ''sync_cron exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- last_sync_at
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'api_configs' AND column_name = 'last_sync_at');
SET @s := IF(@c = 0,
  'ALTER TABLE api_configs ADD COLUMN last_sync_at TIMESTAMP NULL AFTER sync_cron',
  'SELECT ''last_sync_at exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- last_sync_status
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'api_configs' AND column_name = 'last_sync_status');
SET @s := IF(@c = 0,
  'ALTER TABLE api_configs ADD COLUMN last_sync_status VARCHAR(30) NULL AFTER last_sync_at',
  'SELECT ''last_sync_status exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- last_sync_message
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'api_configs' AND column_name = 'last_sync_message');
SET @s := IF(@c = 0,
  'ALTER TABLE api_configs ADD COLUMN last_sync_message TEXT NULL AFTER last_sync_status',
  'SELECT ''last_sync_message exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Verify
SELECT 'api_configs_columns' AS tbl, COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'api_configs'
  AND column_name IN ('api_type','sync_enabled','sync_cron','last_sync_at','last_sync_status','last_sync_message')
ORDER BY ORDINAL_POSITION;
