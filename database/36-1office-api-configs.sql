-- Script 36: 1Office API Configs — Database Schema
-- Ngày: 09/09/2026
-- Mục tiêu: Tạo bảng api_configs, api_field_mappings, api_queue_logs
--           + ALTER station_proposals thêm 4 columns sync

-- ============================================
-- 1. BẢNG api_configs
-- ============================================
CREATE TABLE IF NOT EXISTS api_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  base_url VARCHAR(500) NOT NULL,
  auth_type ENUM('token', 'basic', 'oauth2', 'api_key') DEFAULT 'token',
  auth_config JSON NOT NULL,
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_api_configs_name (name),
  KEY idx_api_configs_active (is_active),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. BẢNG api_field_mappings
-- ============================================
CREATE TABLE IF NOT EXISTS api_field_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  api_config_id INT NOT NULL,
  source_field VARCHAR(100) NOT NULL,
  target_field VARCHAR(100) NOT NULL,
  target_field_type VARCHAR(50) DEFAULT 'text',
  sync_enabled TINYINT(1) DEFAULT 1,
  direction ENUM('push', 'pull', 'both') DEFAULT 'both',
  default_value VARCHAR(500),
  transform_rules JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_field_mappings_config_source (api_config_id, source_field),
  KEY idx_field_mappings_config (api_config_id),
  FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. BẢNG api_queue_logs
-- ============================================
CREATE TABLE IF NOT EXISTS api_queue_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  api_config_id INT,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) DEFAULT 'station_proposals',
  entity_id INT,
  status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  direction ENUM('push', 'pull') DEFAULT 'push',
  request_payload JSON,
  response_payload JSON,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  priority INT DEFAULT 0,
  created_by INT,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_queue_logs_status (status),
  KEY idx_queue_logs_config (api_config_id),
  KEY idx_queue_logs_entity (entity_type, entity_id),
  KEY idx_queue_logs_created (created_at),
  FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. ALTER station_proposals — Thêm 4 columns sync
-- ============================================
-- Kiểm tra trước khi alter để tránh lỗi chạy lại
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'station_management'
    AND TABLE_NAME = 'station_proposals'
    AND COLUMN_NAME = 'contact_1office_id'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE station_proposals
    ADD COLUMN contact_1office_id VARCHAR(100) NULL,
    ADD COLUMN contact_1office_code VARCHAR(100) NULL,
    ADD COLUMN last_synced_at TIMESTAMP NULL,
    ADD COLUMN sync_status ENUM(''none'',''synced'',''pending'',''error'') DEFAULT ''none''',
  'SELECT ''Columns already exist'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index cho sync lookup
SET @idx1 := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND index_name = 'idx_proposals_sync_status');
SET @sql1 := IF(@idx1 = 0, 'CREATE INDEX idx_proposals_sync_status ON station_proposals(sync_status)', 'SELECT ''Index already exists'' AS info');
PREPARE stmt FROM @sql1;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx2 := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND index_name = 'idx_proposals_1office_id');
SET @sql2 := IF(@idx2 = 0, 'CREATE INDEX idx_proposals_1office_id ON station_proposals(contact_1office_id)', 'SELECT ''Index already exists'' AS info');
PREPARE stmt FROM @sql2;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 5. KIỂM TRA KẾT QUẢ
-- ============================================
SELECT 'api_configs' AS tbl, COUNT(*) AS row_count FROM api_configs;
SELECT 'api_field_mappings' AS tbl, COUNT(*) AS row_count FROM api_field_mappings;
SELECT 'api_queue_logs' AS tbl, COUNT(*) AS row_count FROM api_queue_logs;
SELECT 'station_proposals_sync_cols' AS tbl,
  COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'station_management'
  AND TABLE_NAME = 'station_proposals'
  AND COLUMN_NAME IN ('contact_1office_id', 'contact_1office_code', 'last_synced_at', 'sync_status');
