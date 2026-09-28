-- 116: Gioi han gia han deadline bo sung thong tin (docs/8/60, phan 5)
-- extend_max_times = so lan gia han toi da cho 1 de xuat (0 = khong gioi han)
-- extend_max_days_per_time = so ngay toi da cho 1 lan gia han
-- Idempotent.

CREATE TABLE IF NOT EXISTS proposal_lifecycle_configs (
  `key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `value` VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO proposal_lifecycle_configs (`key`, `value`) VALUES
  ('extend_max_times', '3'),
  ('extend_max_days_per_time', '30')
ON DUPLICATE KEY UPDATE `value` = `value`;
