SET @has_synced_cms = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'on_station_sheet_sync_queue'
    AND COLUMN_NAME = 'last_synced_cms_code'
);
SET @add_synced_cms = IF(@has_synced_cms = 0,
  'ALTER TABLE on_station_sheet_sync_queue ADD COLUMN last_synced_cms_code VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt_synced_cms FROM @add_synced_cms;
EXECUTE stmt_synced_cms;
DEALLOCATE PREPARE stmt_synced_cms;

SET @has_synced_proposal = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'on_station_sheet_sync_queue'
    AND COLUMN_NAME = 'last_synced_proposal_code'
);
SET @add_synced_proposal = IF(@has_synced_proposal = 0,
  'ALTER TABLE on_station_sheet_sync_queue ADD COLUMN last_synced_proposal_code VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt_synced_proposal FROM @add_synced_proposal;
EXECUTE stmt_synced_proposal;
DEALLOCATE PREPARE stmt_synced_proposal;

CREATE TABLE IF NOT EXISTS on_station_sheet_sync_warnings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  proposal_id INT NOT NULL,
  old_cms_code VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  new_cms_code VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  resolved_at DATETIME NULL,
  resolved_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_on_sheet_code_change (proposal_id, old_cms_code, new_cms_code),
  KEY idx_on_sheet_warnings_open (resolved_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
