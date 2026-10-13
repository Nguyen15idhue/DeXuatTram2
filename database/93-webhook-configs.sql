-- 93: Bang webhook_configs rieng (docs/8/48)
-- TACH khoi api_configs theo yeu cau. Idempotent.

CREATE TABLE IF NOT EXISTS webhook_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  secret VARCHAR(255) NULL,
  secret_prev VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_webhook_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
