-- 187: Remove the retired 1Office integration after a verified backup.
-- scripts/migrate.sh creates a compressed database dump before applying this migration.

DELETE FROM proposal_lifecycle_configs WHERE `key` = 'auto_push_on_update';

DELETE ff
FROM form_fields ff
JOIN field_definitions fd ON fd.id = ff.field_id
WHERE fd.`key` IN ('external_id', 'id_1office', 'contact_1office_id', 'contact_1office_code', 'he_thong_nguon', 'nhom_nguoi_tao');

DELETE vf
FROM view_fields vf
JOIN field_definitions fd ON fd.id = vf.field_id
WHERE fd.`key` IN ('external_id', 'id_1office', 'contact_1office_id', 'contact_1office_code', 'he_thong_nguon', 'nhom_nguoi_tao');

DELETE FROM field_definitions
WHERE `key` IN ('external_id', 'id_1office', 'contact_1office_id', 'contact_1office_code', 'he_thong_nguon', 'nhom_nguoi_tao');

UPDATE users
SET custom_data = JSON_REMOVE(custom_data, '$.external_id', '$.id_1office')
WHERE custom_data IS NOT NULL;

UPDATE station_proposals
SET custom_data = JSON_REMOVE(
  custom_data,
  '$.id_1office',
  '$.contact_1office_id',
  '$.contact_1office_code',
  '$.last_synced_at',
  '$.last_synced_data',
  '$.sync_status',
  '$.he_thong_nguon',
  '$.nhom_nguoi_tao'
)
WHERE custom_data IS NOT NULL;

DELETE FROM proposal_activity_logs
WHERE source = 'webhook'
   OR action LIKE '%sync%'
   OR action LIKE '%push%'
   OR action LIKE '%pull%'
   OR CAST(changed_fields AS CHAR) LIKE '%1office%'
   OR CAST(changed_fields AS CHAR) LIKE '%contact_1office%';

ALTER TABLE proposal_activity_logs
  MODIFY COLUMN source ENUM('user', 'script', 'system_auto', 'admin_override') NOT NULL DEFAULT 'user';

DELETE FROM journey_activity_logs
WHERE source LIKE '%1office%'
   OR source LIKE '%webhook%'
   OR action LIKE '%sync%'
   OR CAST(changed_fields AS CHAR) LIKE '%1office%';

DELETE FROM proposal_requests
WHERE description LIKE '%1office%' OR note LIKE '%1office%';

DELETE FROM notifications
WHERE title LIKE '%1office%' OR message LIKE '%1office%';

DELETE FROM assistant_logs
WHERE question LIKE '%1office%'
   OR answer LIKE '%1office%'
   OR CAST(sources AS CHAR) LIKE '%1office%'
   OR question LIKE '%google sheet%'
   OR answer LIKE '%google sheet%'
   OR CAST(sources AS CHAR) LIKE '%google sheet%'
   OR question LIKE '%api_configs%'
   OR answer LIKE '%api_configs%'
   OR question LIKE '%api_queue_logs%'
   OR answer LIKE '%api_queue_logs%'
   OR question LIKE '%work_automations%'
   OR answer LIKE '%work_automations%'
   OR question LIKE '%automation_sheet%'
   OR answer LIKE '%automation_sheet%';

DELETE FROM assistant_knowledge
WHERE source_path LIKE '%1office%'
   OR content LIKE '%1office%'
   OR CAST(tags AS CHAR) LIKE '%1office%'
   OR content LIKE '%google sheet%'
   OR content LIKE '%api_configs%'
   OR content LIKE '%api_queue_logs%'
   OR content LIKE '%api_field_mappings%'
   OR content LIKE '%external_users%'
   OR content LIKE '%user_external_map%'
   OR content LIKE '%work_automations%'
   OR content LIKE '%work_automation_runs%'
   OR content LIKE '%automation_sheet%'
   OR content LIKE '%automation_sync%'
   OR content LIKE '%automation_special_nodes%'
   OR content LIKE '%automation_process_versions%'
   OR content LIKE '%external_id%'
   OR content LIKE '%journey_external_refs%'
   OR source_path LIKE '%googleSheet%'
   OR source_path LIKE '%Automation%'
   OR source_path LIKE '%AutoPush%'
   OR source_path LIKE '%FieldMapping%'
   OR source_path LIKE '%ExternalUser%'
   OR source_path LIKE '%webhook%';

DELETE FROM assistant_code_knowledge
WHERE source_path LIKE '%1office%'
   OR content LIKE '%1office%'
   OR source_path LIKE '%googleSheet%'
   OR source_path LIKE '%automation%'
   OR source_path LIKE '%apiConfig%'
   OR source_path LIKE '%externalUser%'
   OR source_path LIKE '%fieldMapping%'
   OR source_path LIKE '%personnelSync%'
   OR source_path LIKE '%queueWorker%'
   OR source_path LIKE '%webhook%'
   OR source_path LIKE '%syncService%'
   OR content LIKE '%google sheet%'
   OR content LIKE '%api_configs%'
   OR content LIKE '%api_queue_logs%'
   OR content LIKE '%api_field_mappings%'
   OR content LIKE '%external_users%'
   OR content LIKE '%user_external_map%'
   OR content LIKE '%work_automations%'
   OR content LIKE '%work_automation_runs%'
   OR content LIKE '%automation_sheet%'
   OR content LIKE '%automation_sync%'
   OR content LIKE '%automation_special_nodes%'
   OR content LIKE '%external_id%'
   OR content LIKE '%contact_1office%'
   OR content LIKE '%last_synced_data%'
   OR content LIKE '%last_synced_at%'
   OR content LIKE '%journey_external_refs%';

DELETE FROM help_articles
WHERE slug LIKE '%1office%'
   OR title LIKE '%1office%'
   OR summary LIKE '%1office%'
   OR slug LIKE '%google-sheet%'
   OR title LIKE '%google sheet%'
   OR summary LIKE '%google sheet%'
   OR title LIKE '%api_configs%'
   OR summary LIKE '%api_configs%'
   OR content_html LIKE '%api_configs%'
   OR CAST(content_json AS CHAR) LIKE '%api_configs%'
   OR content_html LIKE '%1office%'
   OR CAST(content_json AS CHAR) LIKE '%1office%'
   OR CAST(videos AS CHAR) LIKE '%1office%'
   OR CAST(images AS CHAR) LIKE '%1office%'
   OR content_html LIKE '%google sheet%'
   OR CAST(content_json AS CHAR) LIKE '%google sheet%'
   OR CAST(videos AS CHAR) LIKE '%google sheet%'
   OR CAST(images AS CHAR) LIKE '%google sheet%'
   OR CAST(tags AS CHAR) LIKE '%1office%';

UPDATE help_articles AS article
JOIN help_categories AS old_category ON old_category.id = article.category_id
JOIN help_categories AS general_category ON general_category.slug = 'cau-hinh'
SET article.category_id = general_category.id
WHERE old_category.slug = 'tich-hop';

DELETE FROM help_categories
WHERE slug LIKE '%1office%' OR title LIKE '%1office%' OR slug = 'tich-hop';

DELETE FROM report_dashboard_configs
WHERE CAST(layout_json AS CHAR) LIKE '%journey_sync_errors%'
   OR CAST(layout_json AS CHAR) LIKE '%oneoffice%'
   OR CAST(layout_json AS CHAR) LIKE '%automation_runs%'
   OR CAST(layout_json AS CHAR) LIKE '%sync_staleness%'
   OR CAST(layout_json AS CHAR) LIKE '%automation_failures%';

DELETE FROM report_builder_dashboards
WHERE CAST(layout_json AS CHAR) LIKE '%oneoffice_mirror%'
   OR CAST(layout_json AS CHAR) LIKE '%oneoffice_coverage%'
   OR CAST(layout_json AS CHAR) LIKE '%journey_sync_errors%'
   OR CAST(layout_json AS CHAR) LIKE '%automation_runs%'
   OR CAST(layout_json AS CHAR) LIKE '%sync_staleness%'
   OR CAST(layout_json AS CHAR) LIKE '%automation_failures%';

DROP TABLE IF EXISTS automation_sheet_mappings;
DROP TABLE IF EXISTS work_automation_runs;
DROP TABLE IF EXISTS automation_sync_snapshots;
DROP TABLE IF EXISTS automation_sync_state;
DROP TABLE IF EXISTS automation_field_cache;
DROP TABLE IF EXISTS automation_special_nodes;
DROP TABLE IF EXISTS automation_process_versions;
DROP TABLE IF EXISTS work_automations;
DROP TABLE IF EXISTS oneoffice_contact_cache;
DROP TABLE IF EXISTS journey_external_refs;
DROP TABLE IF EXISTS external_users;
DROP TABLE IF EXISTS user_external_map;
DROP TABLE IF EXISTS api_field_mappings;
DROP TABLE IF EXISTS api_queue_logs;
DROP TABLE IF EXISTS webhook_configs;
DROP TABLE IF EXISTS api_configs;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'external_id') > 0,
  'ALTER TABLE users DROP COLUMN external_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND column_name = 'contact_1office_id') > 0,
  'ALTER TABLE station_proposals DROP COLUMN contact_1office_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND column_name = 'contact_1office_code') > 0,
  'ALTER TABLE station_proposals DROP COLUMN contact_1office_code',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND column_name = 'last_synced_at') > 0,
  'ALTER TABLE station_proposals DROP COLUMN last_synced_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND column_name = 'last_synced_data') > 0,
  'ALTER TABLE station_proposals DROP COLUMN last_synced_data',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND column_name = 'sync_status') > 0,
  'ALTER TABLE station_proposals DROP COLUMN sync_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
