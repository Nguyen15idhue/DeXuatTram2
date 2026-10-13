-- 129: Snapshot o Sheet + state cau truc mapping (docs/8/67 dot 2)
-- Idempotent.

CREATE TABLE IF NOT EXISTS automation_sync_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  automation_id INT NOT NULL,
  version VARCHAR(16) NOT NULL,
  process_id INT NOT NULL,
  cells_json JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_snap (automation_id, version, process_id),
  INDEX idx_snap_ver (automation_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS automation_sync_state (
  automation_id INT NOT NULL,
  version VARCHAR(16) NOT NULL,
  mapping_json JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (automation_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
