-- 75: Chuyen truong "Loai dat" (station_proposals.land_type) tu text sang select voi 6 lua chon.
-- - Doi type -> select + options (menu tha xuong).
-- - Map cac gia tri cu ve lua chon moi; gia tri khong khop -> de trong de nguoi dung chon lai.
-- Idempotent, khong DROP.

UPDATE field_definitions
   SET type = 'select',
       option_style = '{"defaultColor":"#666666","defaultBorderRadius":"rounded"}',
       options = '[{"value":"Đất thương mại, dịch vụ","label":"Đất thương mại, dịch vụ","color":"#666666","borderRadius":"rounded"},{"value":"Đất khu công nghiệp","label":"Đất khu công nghiệp","color":"#666666","borderRadius":"rounded"},{"value":"Đất giao thông/Bến bãi/Điểm dừng nghỉ","label":"Đất giao thông/Bến bãi/Điểm dừng nghỉ","color":"#666666","borderRadius":"rounded"},{"value":"Đất ở","label":"Đất ở","color":"#666666","borderRadius":"rounded"},{"value":"Đất nông nghiệp","label":"Đất nông nghiệp","color":"#666666","borderRadius":"rounded"},{"value":"Đất khác/Chưa xác định","label":"Đất khác/Chưa xác định","color":"#666666","borderRadius":"rounded"}]'
 WHERE entity = 'station_proposals' AND `key` = 'land_type';

-- Map du lieu cu sang lua chon moi
UPDATE station_proposals SET land_type = 'Đất ở' WHERE land_type = 'Thổ cư';
UPDATE station_proposals SET land_type = 'Đất thương mại, dịch vụ' WHERE land_type = 'Đất thương mại';
UPDATE station_proposals SET land_type = 'Đất khác/Chưa xác định' WHERE land_type IN ('Đất hỗn hợp', 'Đất công');

-- Gia tri cu khong khop lua chon nao -> tra ve rong (tranh validate "Loai dat khong hop le")
UPDATE station_proposals
   SET land_type = NULL
 WHERE land_type IS NOT NULL
   AND land_type <> ''
   AND land_type NOT IN (
     'Đất thương mại, dịch vụ',
     'Đất khu công nghiệp',
     'Đất giao thông/Bến bãi/Điểm dừng nghỉ',
     'Đất ở',
     'Đất nông nghiệp',
     'Đất khác/Chưa xác định'
   );

SELECT 'land_type_field' AS metric, type, options FROM field_definitions
 WHERE entity = 'station_proposals' AND `key` = 'land_type';
SELECT 'land_type_data' AS metric, land_type, COUNT(*) AS n FROM station_proposals GROUP BY land_type ORDER BY n DESC;
