-- 119: Them source 'restore' cho proposal_activity_logs (khoi phuc de xuat tu 1Office)
-- Idempotent.

SET @has_restore = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'proposal_activity_logs'
    AND COLUMN_NAME = 'source'
    AND COLUMN_TYPE LIKE '%restore%'
);

SET @sql = IF(@has_restore = 0,
  'ALTER TABLE proposal_activity_logs MODIFY COLUMN source ENUM(''user'',''webhook'',''script'',''system_auto'',''admin_override'',''import'',''restore'')',
  'SELECT ''Source restore already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
