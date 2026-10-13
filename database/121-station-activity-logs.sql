-- 121: Nhat ky hoat dong tram + webhook inbound tram (ke hoach 65)
-- Mirror proposal_activity_logs cho entity stations.
-- Idempotent.

CREATE TABLE IF NOT EXISTS station_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  station_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NULL,
  changed_fields JSON NULL,
  reject_reason TEXT NULL,
  actor_id INT NULL,
  actor_role VARCHAR(30) NULL,
  source ENUM('user','webhook','script','system_auto','admin_override','import') NOT NULL DEFAULT 'user',
  manual_override TINYINT(1) NOT NULL DEFAULT 0,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_station_activity_station (station_id, created_at),
  KEY idx_station_activity_source (source, created_at),
  CONSTRAINT fk_station_activity_station FOREIGN KEY (station_id) REFERENCES stations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
