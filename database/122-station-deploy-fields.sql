-- 122: Field trien khai ha tang tram (ke hoach 65)
-- 1Office gui noi dung trien khai ve webhook station-update theo key nay.
-- Hien tren form/view: admin keo field vao form stations bang FormBuilder.
-- Idempotent.

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'stations', 'trien_khai_ha_tang', 'Triển khai hạ tầng trạm', 'textarea', 'json', 0, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'stations' AND `key` = 'trien_khai_ha_tang'
);
