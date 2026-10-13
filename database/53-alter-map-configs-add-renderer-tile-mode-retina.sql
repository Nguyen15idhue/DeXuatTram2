-- Script 53: Them cot dieu khien renderer/tile_mode/retina vao map_configs
-- Ngay: 13/09/2026
-- Muc tieu: cho phep chon renderer (leaflet/google...), che do tile (proxy/direct), retina @2x
-- Idempotent: chi them cot neu chua co. KHONG dung DROP.

-- renderer
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'map_configs' AND column_name = 'renderer');
SET @s := IF(@c = 0,
  'ALTER TABLE map_configs ADD COLUMN renderer VARCHAR(30) NOT NULL DEFAULT ''leaflet'' AFTER auth_type',
  'SELECT ''renderer exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- tile_mode
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'map_configs' AND column_name = 'tile_mode');
SET @s := IF(@c = 0,
  'ALTER TABLE map_configs ADD COLUMN tile_mode VARCHAR(20) NOT NULL DEFAULT ''proxy'' AFTER renderer',
  'SELECT ''tile_mode exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- retina
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'map_configs' AND column_name = 'retina');
SET @s := IF(@c = 0,
  'ALTER TABLE map_configs ADD COLUMN retina TINYINT(1) NOT NULL DEFAULT 0 AFTER tile_mode',
  'SELECT ''retina exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Verify
SELECT 'map_configs_control_cols' AS tbl, COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'map_configs'
  AND column_name IN ('renderer','tile_mode','retina')
ORDER BY ORDINAL_POSITION;
