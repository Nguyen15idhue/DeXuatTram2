-- 98: MapLibre 3D mac dinh TAT (user bat tay bang nut 3D tren map / trang map-config)
-- Idempotent (chi chay 1 lan nho tracking schema_migrations).

UPDATE map_configs SET enable_3d = 0 WHERE enable_3d <> 0;
