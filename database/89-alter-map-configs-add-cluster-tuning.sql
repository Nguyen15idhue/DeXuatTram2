-- Script 89: Them cluster_radius + cluster_max_zoom vao map_configs
-- Ngay: 17/09/2026
-- Idempotent: chi them cot neu chua co. KHONG dung DROP.

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'map_configs' AND column_name = 'cluster_radius');
SET @s := IF(@c = 0,
  'ALTER TABLE map_configs ADD COLUMN cluster_radius INT NOT NULL DEFAULT 70 AFTER show_cluster',
  'SELECT ''cluster_radius exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'map_configs' AND column_name = 'cluster_max_zoom');
SET @s := IF(@c = 0,
  'ALTER TABLE map_configs ADD COLUMN cluster_max_zoom INT NOT NULL DEFAULT 18 AFTER cluster_radius',
  'SELECT ''cluster_max_zoom exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'map_configs_cluster' AS tbl, COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'map_configs'
  AND column_name IN ('cluster_radius', 'cluster_max_zoom');
