-- 128: Mapping Sheet theo version + cache cay field + seed automation sync (docs/8/67, Buoc 1)
-- Idempotent.

CREATE TABLE IF NOT EXISTS automation_sheet_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  automation_id INT NOT NULL,
  version VARCHAR(16) NOT NULL,
  source_path VARCHAR(255) NOT NULL,
  sheet_col VARCHAR(8) NOT NULL,
  label VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_map (automation_id, version, source_path),
  INDEX idx_map_version (automation_id, version),
  CONSTRAINT fk_map_automation FOREIGN KEY (automation_id) REFERENCES work_automations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS automation_field_cache (
  version VARCHAR(16) NOT NULL PRIMARY KEY,
  tree_json JSON NOT NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_field_cache_time (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO work_automations (automation_key, name, enabled, project_code, retry_max, retry_interval_s, find_timeout_s, frequency_min, note) VALUES
  ('sync_process_report', 'Đồng bộ báo cáo quy trình sang Google Sheet', 0, '2', 3, 20, 60, 15, 'Upsert báo cáo quy trình theo version vào tab riêng, cron 15 phút')
ON DUPLICATE KEY UPDATE name = VALUES(name);
