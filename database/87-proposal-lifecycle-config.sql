-- 87: Cau hinh vong doi de xuat (docs/8/46)
-- contract_signed_to_station_days = 90 (Ky thanh cong -> tram moi sau 90 ngay)
-- contract_failed_to_cancel_days = 30 (Ky that bai -> Huy sau 30 ngay)
-- Idempotent.

CREATE TABLE IF NOT EXISTS proposal_lifecycle_configs (
  `key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `value` VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO proposal_lifecycle_configs (`key`, `value`) VALUES
  ('contract_signed_to_station_days', '90'),
  ('contract_failed_to_cancel_days', '30'),
  ('lifecycle_max_retries', '5'),
  ('lifecycle_check_cron', '*/5 * * * *')
ON DUPLICATE KEY UPDATE `value` = `value`;
