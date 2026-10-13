-- 74: Dong bo options field vung_mien voi gia tri trong dm_tinh (Bắc/Trung/Nam)
-- Truoc day options dung 'bac'/'trung'/'nam' (khong dau) -> auto-fill tu dm_tinh tra 'Bắc'
-- gay loi validate "Vùng miền không hợp lệ".
-- Idempotent, khong DROP.

UPDATE field_definitions
   SET options = '[{"value":"Bắc","label":"Miền Bắc","color":"#666666","borderRadius":"rounded"},{"value":"Trung","label":"Miền Trung","color":"#666666","borderRadius":"rounded"},{"value":"Nam","label":"Miền Nam","color":"#666666","borderRadius":"rounded"}]'
 WHERE entity = 'station_proposals' AND `key` = 'vung_mien';

SELECT 'vung_mien_options' AS metric, options FROM field_definitions WHERE entity='station_proposals' AND `key`='vung_mien';
