-- 194: Luu thong tin van chuyen va tong tien tren phieu xuat kho,
-- dong thoi dam bao co bang hoa don ON tram.
-- Trang thai van chuyen ap dung cho ca phieu, khong tach theo tung mat hang.
-- Idempotent.

SET @has_carrier := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_exports' AND COLUMN_NAME = 'carrier'
);
SET @sql_carrier := IF(@has_carrier = 0,
  'ALTER TABLE warehouse_exports ADD COLUMN carrier VARCHAR(255) NULL COMMENT ''Ben van chuyen'' AFTER charging_station_id',
  'SELECT ''warehouse_exports.carrier da ton tai'' AS info');
PREPARE stmt_carrier FROM @sql_carrier; EXECUTE stmt_carrier; DEALLOCATE PREPARE stmt_carrier;

SET @has_transport_code := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_exports' AND COLUMN_NAME = 'transport_code'
);
SET @sql_transport_code := IF(@has_transport_code = 0,
  'ALTER TABLE warehouse_exports ADD COLUMN transport_code VARCHAR(100) NULL COMMENT ''Ma van chuyen'' AFTER carrier',
  'SELECT ''warehouse_exports.transport_code da ton tai'' AS info');
PREPARE stmt_transport_code FROM @sql_transport_code; EXECUTE stmt_transport_code; DEALLOCATE PREPARE stmt_transport_code;

SET @has_transport_status := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_exports' AND COLUMN_NAME = 'transport_status'
);
SET @sql_transport_status := IF(@has_transport_status = 0,
  'ALTER TABLE warehouse_exports ADD COLUMN transport_status ENUM(''PENDING'',''SHIPPING'',''DELIVERED'',''FAILED'',''RETURNED'') NOT NULL DEFAULT ''PENDING'' COMMENT ''Trang thai van chuyen ca phieu'' AFTER transport_code',
  'SELECT ''warehouse_exports.transport_status da ton tai'' AS info');
PREPARE stmt_transport_status FROM @sql_transport_status; EXECUTE stmt_transport_status; DEALLOCATE PREPARE stmt_transport_status;

SET @has_total_amount := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_exports' AND COLUMN_NAME = 'total_amount'
);
SET @sql_total_amount := IF(@has_total_amount = 0,
  'ALTER TABLE warehouse_exports ADD COLUMN total_amount DECIMAL(15,2) NULL COMMENT ''Tong so tien tren phieu xuat'' AFTER transport_status',
  'SELECT ''warehouse_exports.total_amount da ton tai'' AS info');
PREPARE stmt_total_amount FROM @sql_total_amount; EXECUTE stmt_total_amount; DEALLOCATE PREPARE stmt_total_amount;

CREATE TABLE IF NOT EXISTS charging_station_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  charging_station_id INT NOT NULL,
  proposal_id INT NOT NULL,
  invoice_type ENUM('DEPOSIT','REFUND','PAYMENT') NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  content TEXT NULL,
  evidence_file_id INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_csi_charging_station FOREIGN KEY (charging_station_id) REFERENCES charging_stations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_csi_proposal FOREIGN KEY (proposal_id) REFERENCES station_proposals (id) ON DELETE RESTRICT,
  CONSTRAINT fk_csi_evidence_file FOREIGN KEY (evidence_file_id) REFERENCES files (id) ON DELETE SET NULL,
  CONSTRAINT fk_csi_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  KEY idx_csi_station (charging_station_id, created_at),
  KEY idx_csi_proposal (proposal_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
