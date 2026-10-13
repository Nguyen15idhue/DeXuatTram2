-- Script 57: Them default_mode + layers_config vao map_configs
-- Ngay: 13/09/2026
-- Muc tieu: chuan hoa mo hinh Provider - Renderer - Mode/Layer cho ke hoach 36
-- Idempotent: chi them cot neu chua co, backfill khi NULL. KHONG dung DROP.

-- default_mode
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'map_configs' AND column_name = 'default_mode');
SET @s := IF(@c = 0,
  'ALTER TABLE map_configs ADD COLUMN default_mode VARCHAR(30) NOT NULL DEFAULT ''streets'' AFTER renderer',
  'SELECT ''default_mode exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- layers_config
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'map_configs' AND column_name = 'layers_config');
SET @s := IF(@c = 0,
  'ALTER TABLE map_configs ADD COLUMN layers_config JSON NULL AFTER default_mode',
  'SELECT ''layers_config exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Backfill layers_config tu cau hinh hien tai (khong chua secret: chi provider + style + mode)
UPDATE map_configs
SET layers_config = JSON_ARRAY(JSON_OBJECT(
  'id', 'base',
  'role', 'base',
  'type', 'raster',
  'provider', COALESCE(tile_provider_id, 'leaflet-osm'),
  'style', NULLIF(style_url, ''),
  'mode', 'streets'
))
WHERE layers_config IS NULL;

SELECT 'map_configs_mode_layers' AS tbl, COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'map_configs'
  AND column_name IN ('default_mode', 'layers_config')
ORDER BY ORDINAL_POSITION;
