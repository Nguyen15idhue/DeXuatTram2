-- Script 54: Bang geocode_configs — cau hinh dich vu reverse geocoding
-- Ngay: 13/09/2026
-- Muc tieu: luu provider/api_key/lang/countrycodes/cache_ttl cho tu dong phan giai dia chi
-- Idempotent: CREATE IF NOT EXISTS. KHONG dung DROP.

CREATE TABLE IF NOT EXISTS geocode_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(50) NOT NULL DEFAULT 'geoapify',
  api_key VARCHAR(255) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  lang VARCHAR(10) NOT NULL DEFAULT 'vi',
  countrycodes VARCHAR(50) NOT NULL DEFAULT 'vn',
  cache_ttl_days INT NOT NULL DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed mot dong cau hinh mac dinh (disabled)
INSERT INTO geocode_configs (provider, api_key, enabled, lang, countrycodes, cache_ttl_days)
SELECT 'geoapify', NULL, 0, 'vi', 'vn', 30
WHERE NOT EXISTS (SELECT 1 FROM geocode_configs);

-- Verify
SELECT 'geocode_configs' AS tbl, COUNT(*) AS row_count FROM geocode_configs;
