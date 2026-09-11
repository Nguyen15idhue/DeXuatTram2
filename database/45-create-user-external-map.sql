-- Script 45: Bang user_external_map — lien ket user noi bo voi ID nguoi dung cac he ben ngoai
-- Ngay: 10/09/2026
-- Muc tieu: 1 user co the co ID khac nhau o moi he (1office, crmB...)

CREATE TABLE IF NOT EXISTS user_external_map (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  `system` VARCHAR(50) NOT NULL,
  external_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_system (user_id, `system`),
  UNIQUE KEY uq_system_external (`system`, external_id),
  KEY idx_user (user_id),
  CONSTRAINT fk_uem_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verify
SELECT 'user_external_map' AS tbl, COUNT(*) AS row_count FROM user_external_map;
