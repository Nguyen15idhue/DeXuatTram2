-- 172-ev-report-rename-link-key.sql
-- Đổi key field câu hỏi "có muốn hợp tác lắp đặt trạm sạc" từ `lien_ket_lap_tram`
-- sang `hop_tac_lap_tram` cho các DB đã chạy bản đầu của migration 170.
--
-- Bối cảnh: migration 170 ban đầu tạo key `lien_ket_lap_tram`; sau đó đổi sang
-- `hop_tac_lap_tram`. DB đã chạy bản cũ cần rename để khớp code (FE/BE/171).
-- Trên DB mới (170 chạy bản mới) script này không làm gì.
--
-- Idempotent. Không DROP/CREATE. Không đụng entity khác.
--   - field_definitions.key  : lien_ket_lap_tram -> hop_tac_lap_tram
--   - form_fields/view_fields: giữ nguyên (trỏ theo field_id, không theo key)
--   - custom_data của bản ghi cũ: đổi tên key JSON tương ứng

-- ============ 1. Chỉ chạy khi còn key cũ và chưa có key mới ============
SET @old_fd = (
    SELECT id FROM field_definitions
    WHERE entity = 'ev_charging_reports' AND `key` = 'lien_ket_lap_tram'
    ORDER BY id ASC LIMIT 1
);
SET @new_fd = (
    SELECT id FROM field_definitions
    WHERE entity = 'ev_charging_reports' AND `key` = 'hop_tac_lap_tram'
    ORDER BY id ASC LIMIT 1
);

-- ============ 2. Đổi key trong custom_data của dữ liệu đã có ============
UPDATE ev_charging_reports
   SET custom_data = JSON_REMOVE(
           JSON_SET(
               custom_data,
               '$.hop_tac_lap_tram',
               JSON_EXTRACT(custom_data, '$.lien_ket_lap_tram')
           ),
           '$.lien_ket_lap_tram'
       )
 WHERE @old_fd IS NOT NULL
   AND @new_fd IS NULL
   AND JSON_VALID(custom_data)
   AND JSON_CONTAINS_PATH(custom_data, 'one', '$.lien_ket_lap_tram') = 1;

-- ============ 3. Đổi key của field definition ============
UPDATE field_definitions
   SET `key` = 'hop_tac_lap_tram'
 WHERE id = @old_fd
   AND @old_fd IS NOT NULL
   AND @new_fd IS NULL;
