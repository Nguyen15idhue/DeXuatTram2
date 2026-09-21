-- 100: Them 'import' vao ENUM source cua proposal_activity_logs (log import excel)
-- Idempotent (guard information_schema).

SET @has_import := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_activity_logs' AND COLUMN_NAME = 'source'
    AND COLUMN_TYPE LIKE '%import%'
);
SET @sql_src := IF(@has_import = 0,
'ALTER TABLE proposal_activity_logs MODIFY COLUMN source ENUM(''user'',''webhook'',''script'',''system_auto'',''admin_override'',''import'') NOT NULL DEFAULT ''user''',
'SELECT ''enum source already has import'' AS info');
PREPARE stmt_src FROM @sql_src;
EXECUTE stmt_src;
DEALLOCATE PREPARE stmt_src;
