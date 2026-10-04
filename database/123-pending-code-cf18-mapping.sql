-- 123: Mapping ma tram cho -> cf18 + label (ke hoach 65)
-- Dong mapping thuong (khong hardcode): seed san de chay ngay, van sua/xoa lai duoc tren UI.
-- Idempotent (guard NOT EXISTS + chi set label khi chua co).

-- 1. Dong mapping cho config contact 1Office mac dinh (giong getDefaultPushConfig)
INSERT INTO api_field_mappings (api_config_id, source_field, target_field, target_field_type, sync_enabled, direction)
SELECT c.id, 'pending_station_code', 'cf18', 'text', 1, 'push'
FROM api_configs c
WHERE c.system_key = '1office' AND c.api_type = 'contact' AND c.is_active = 1
  AND NOT EXISTS (
    SELECT 1 FROM api_field_mappings m
    WHERE m.api_config_id = c.id AND m.target_field = 'cf18'
  )
ORDER BY c.id ASC LIMIT 1;

-- 2. Label "Ma tram cho" cho cf18 (chi khi chua co, de ton trong ten do user tu dat)
UPDATE api_configs c
SET c.field_metadata = JSON_SET(COALESCE(c.field_metadata, JSON_OBJECT()), '$.cf18.label', 'Mã trạm chờ', '$.cf18.type', 'text'),
    c.updated_at = NOW()
WHERE c.system_key = '1office' AND c.api_type = 'contact' AND c.is_active = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(COALESCE(c.field_metadata, JSON_OBJECT()), '$.cf18.label')) IS NULL;
