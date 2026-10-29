-- 191: Cac bang co ban cho quan ly kho tru sac (1 kho duy nhat).
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS charging_poles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  charging_type ENUM('AC','DC') NOT NULL,
  power_kw DECIMAL(8,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  supplier VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_charging_poles_quantity CHECK (quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  importer_user_id INT NOT NULL,
  import_date DATETIME NOT NULL,
  charging_station_id INT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_warehouse_imports_user FOREIGN KEY (importer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_warehouse_imports_station FOREIGN KEY (charging_station_id) REFERENCES charging_stations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_import_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  import_id INT NOT NULL,
  pole_id INT NOT NULL,
  quantity INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_warehouse_import_items (import_id, pole_id),
  CONSTRAINT fk_warehouse_import_items_import FOREIGN KEY (import_id) REFERENCES warehouse_imports (id) ON DELETE CASCADE,
  CONSTRAINT fk_warehouse_import_items_pole FOREIGN KEY (pole_id) REFERENCES charging_poles (id) ON DELETE RESTRICT,
  CONSTRAINT chk_warehouse_import_items_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_exports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exporter_user_id INT NOT NULL,
  export_date DATETIME NOT NULL,
  reason TEXT NULL,
  charging_station_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_warehouse_exports_user FOREIGN KEY (exporter_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_warehouse_exports_station FOREIGN KEY (charging_station_id) REFERENCES charging_stations (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_export_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  export_id INT NOT NULL,
  pole_id INT NOT NULL,
  quantity INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_warehouse_export_items (export_id, pole_id),
  CONSTRAINT fk_warehouse_export_items_export FOREIGN KEY (export_id) REFERENCES warehouse_exports (id) ON DELETE CASCADE,
  CONSTRAINT fk_warehouse_export_items_pole FOREIGN KEY (pole_id) REFERENCES charging_poles (id) ON DELETE RESTRICT,
  CONSTRAINT chk_warehouse_export_items_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
