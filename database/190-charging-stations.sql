-- 190: Module Quan ly ON tram (charging_stations), quan he 1-1 voi station_proposals.
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS charging_stations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ma_tram VARCHAR(30) NULL,
  proposal_id INT NOT NULL,
  on_date DATE NULL,
  acceptance_file_id INT NULL,
  acceptance_user_id INT NULL,
  acceptance_date DATE NULL,
  status ENUM('ONBOARDING','DELIVERING','INSTALLING','ACCEPTANCE','OPERATING') NOT NULL DEFAULT 'ONBOARDING',
  sub_status ENUM('NOT_DELIVERED','DELIVERING','DELIVERED','NOT_INSTALLED','INSTALLING','INSTALLED','NOT_ACCEPTED','ACCEPT_FAILED','ACCEPT_PASSED','CONFIGURING','ACTIVE') NULL,
  contract_status ENUM('NOT','DONE','CANCELLED') NULL DEFAULT 'NOT',
  infra_power_status ENUM('NOT','DOING','DONE') NULL DEFAULT 'NOT',
  infra_site_status ENUM('NOT','DOING','DONE') NULL DEFAULT 'NOT',
  payment_status ENUM('NOT','DOING','DONE') NULL DEFAULT 'NOT',
  description TEXT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_charging_stations_proposal (proposal_id),
  UNIQUE KEY uq_charging_stations_ma_tram (ma_tram),
  KEY idx_charging_stations_status (status, updated_at),
  CONSTRAINT fk_charging_stations_proposal FOREIGN KEY (proposal_id) REFERENCES station_proposals (id) ON DELETE RESTRICT,
  CONSTRAINT fk_charging_stations_acceptance_file FOREIGN KEY (acceptance_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_charging_stations_acceptance_user FOREIGN KEY (acceptance_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS charging_station_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  charging_station_id INT NOT NULL,
  file_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_charging_station_images (charging_station_id, file_id),
  CONSTRAINT fk_charging_station_images_station FOREIGN KEY (charging_station_id) REFERENCES charging_stations (id) ON DELETE CASCADE,
  CONSTRAINT fk_charging_station_images_file FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS charging_station_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  charging_station_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NULL,
  changed_fields JSON NULL,
  reject_reason TEXT NULL,
  actor_id INT NULL,
  actor_role VARCHAR(30) NULL,
  source ENUM('user','script','system_auto') NOT NULL DEFAULT 'user',
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_charging_station_logs (charging_station_id, created_at),
  CONSTRAINT fk_charging_station_logs_station FOREIGN KEY (charging_station_id) REFERENCES charging_stations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
