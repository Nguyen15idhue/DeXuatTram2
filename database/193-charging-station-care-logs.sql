-- 193: Lich su cham soc khach hang cho ho so ON tram.
-- Idempotent.

CREATE TABLE IF NOT EXISTS charging_station_care_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  charging_station_id INT NOT NULL,
  employee_user_id INT NULL,
  contact_time DATETIME NOT NULL,
  content TEXT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_care_logs_station FOREIGN KEY (charging_station_id) REFERENCES charging_stations (id) ON DELETE CASCADE,
  CONSTRAINT fk_care_logs_employee FOREIGN KEY (employee_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_care_logs_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  KEY idx_care_logs_station_time (charging_station_id, contact_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
