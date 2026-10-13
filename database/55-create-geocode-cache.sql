-- Script 55: Bang geocode_cache — cache ket qua reverse geocoding
-- Ngay: 13/09/2026
-- Muc tieu: giam so lan goi API (tiet kiem credit), tang toc do
-- Idempotent: CREATE IF NOT EXISTS. KHONG dung DROP.

CREATE TABLE IF NOT EXISTS geocode_cache (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  lat_key DECIMAL(10,4) NOT NULL,
  lng_key DECIMAL(11,4) NOT NULL,
  result JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_geocode_lat_lng (lat_key, lng_key),
  KEY idx_geocode_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verify
SELECT 'geocode_cache' AS tbl, COUNT(*) AS row_count FROM geocode_cache;
