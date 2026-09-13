-- Script 58: Them enable_3d vao map_configs (Phase 9 - 3D/terrain nang cao)
-- Ngay: 13/09/2026
-- Idempotent: chi them cot neu chua co. KHONG dung DROP.

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'map_configs' AND column_name = 'enable_3d');
SET @s := IF(@c = 0,
  'ALTER TABLE map_configs ADD COLUMN enable_3d TINYINT(1) NOT NULL DEFAULT 0 AFTER retina',
  'SELECT ''enable_3d exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'map_configs_3d' AS tbl, COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'map_configs' AND column_name = 'enable_3d';
