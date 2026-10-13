-- 91: Luat gan nguoi phu trach/giao moi (docs/8/47 - Buoc 3)
-- nguoi_phu_trach: owner_or_manager -> area_director (GDKV)
-- nguoi_giao_phu_trach: parent_sales -> center_director (GDTT cung phong ban)
-- Idempotent.

UPDATE field_definitions
SET source_config = '{"auto_user": "area_director"}'
WHERE entity = 'station_proposals' AND `key` = 'nguoi_phu_trach'
  AND (source_config IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(source_config, '$.auto_user')) <> 'area_director');

UPDATE field_definitions
SET source_config = '{"auto_user": "center_director"}'
WHERE entity = 'station_proposals' AND `key` = 'nguoi_giao_phu_trach'
  AND (source_config IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(source_config, '$.auto_user')) <> 'center_director');
