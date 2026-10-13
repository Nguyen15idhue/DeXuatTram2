-- Script 48: Bang external_users — luu danh sach nhan su 1Office (pull ve DB he thong)
-- Ngay: 11/09/2026
-- Muc tieu: lam nguon dropdown "Ma NS - Ten" thay vi nhap tay ID; phuc vu quy doi khi push/pull
-- external_id = personnel_id (ID Ho so nhan su); contact_id = ID lien he; code = Ma NS

CREATE TABLE IF NOT EXISTS external_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  api_config_id INT NULL,
  `system` VARCHAR(50) NOT NULL DEFAULT '1office',
  base_url VARCHAR(500) NULL,
  external_id VARCHAR(100) NOT NULL COMMENT 'personnel_id - ID Ho so nhan su',
  contact_id VARCHAR(100) NULL COMMENT 'ID lien he 1Office',
  code VARCHAR(100) NULL COMMENT 'Ma NS',
  fullname VARCHAR(255) NULL,
  username VARCHAR(100) NULL,
  department_id VARCHAR(100) NULL,
  department_name VARCHAR(255) NULL,
  status VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  raw_data JSON NULL,
  synced_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_system_external (`system`, external_id),
  KEY idx_system_code (`system`, code),
  KEY idx_system_contact (`system`, contact_id),
  KEY idx_system_active (`system`, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verify
SELECT 'external_users' AS tbl, COUNT(*) AS row_count FROM external_users;
