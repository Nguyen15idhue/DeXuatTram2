-- 170-ev-report-link-station.sql
-- Kế hoạch 78 (bổ sung): thêm câu hỏi bắt buộc "Anh/Chị có muốn liên kết với chúng tôi để
-- lắp đặt trạm sạc không?" vào form khách chia sẻ điểm sạc xe điện (ev_charging_reports).
--   - Field `hop_tac_lap_tram`: type select, source_type json (lưu custom_data),
--     required = 1, 2 lựa chọn thủ công (Có / Không).
--   - Gắn vào 3 form (GPS mặc định / Nhập tay / Xem - sửa) để form khách validate + popup
--     xem/sửa của quản trị hiển thị.
-- Idempotent (an toàn khi chạy lại). Không sửa entity/bảng khác. Không DROP/CREATE lại.

-- ============ 1. Field definition ============
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, `options`, help_text, status)
SELECT
    'ev_charging_reports',
    'hop_tac_lap_tram',
    'Quý khách có muốn hợp tác với chúng tôi để lắp đặt trạm sạc không?',
    'select',
    'json',
    1,
    CAST('[{"value":"Có","label":"Có"},{"value":"Không","label":"Không"}]' AS JSON),
    '',
    'active'
WHERE NOT EXISTS (
    SELECT 1 FROM field_definitions
    WHERE entity = 'ev_charging_reports' AND `key` = 'hop_tac_lap_tram'
);

SET @evr_link_fd = (
    SELECT id FROM field_definitions
    WHERE entity = 'ev_charging_reports' AND `key` = 'hop_tac_lap_tram'
    ORDER BY id ASC LIMIT 1
);

-- ============ 2. Form khách GPS (purpose create, mặc định) ============
SET @evr_gps_id = (
    SELECT id FROM forms
    WHERE entity = 'ev_charging_reports' AND purpose = 'create' AND name = 'Chia sẻ điểm sạc - GPS'
    ORDER BY id ASC LIMIT 1
);
SET @evr_gps_order = (
    SELECT COALESCE(MAX(ff.order_index), -1) + 1 FROM form_fields ff WHERE ff.form_id = @evr_gps_id
);
SET @evr_gps_row = (
    SELECT COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowIndex')) AS UNSIGNED)), -1) + 1
      FROM form_fields ff WHERE ff.form_id = @evr_gps_id
);

UPDATE forms
   SET layout_config = JSON_ARRAY_APPEND(
           layout_config,
           '$.sections[1].rows',
           CAST('{"id":"evr_gps_s2_r4","columns":"1:1"}' AS JSON)
       )
 WHERE id = @evr_gps_id
   AND @evr_link_fd IS NOT NULL
   AND JSON_CONTAINS(JSON_EXTRACT(layout_config, '$.sections[1].rows'), CAST('{"id":"evr_gps_s2_r4"}' AS JSON)) = 0;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_gps_id, @evr_link_fd, @evr_gps_order, 1,
       JSON_OBJECT('rowId', 'evr_gps_s2_r4', 'colIndex', 0, 'rowIndex', @evr_gps_row, 'colSpan', 1)
 WHERE @evr_link_fd IS NOT NULL AND @evr_gps_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_gps_id AND ff.field_id = @evr_link_fd);

-- ============ 3. Form khách nhập tay (purpose all) ============
SET @evr_man_id = (
    SELECT id FROM forms
    WHERE entity = 'ev_charging_reports' AND purpose = 'all' AND name = 'Chia sẻ điểm sạc - Nhập tay'
    ORDER BY id ASC LIMIT 1
);
SET @evr_man_order = (
    SELECT COALESCE(MAX(ff.order_index), -1) + 1 FROM form_fields ff WHERE ff.form_id = @evr_man_id
);
SET @evr_man_row = (
    SELECT COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowIndex')) AS UNSIGNED)), -1) + 1
      FROM form_fields ff WHERE ff.form_id = @evr_man_id
);

UPDATE forms
   SET layout_config = JSON_ARRAY_APPEND(
           layout_config,
           '$.sections[0].rows',
           CAST('{"id":"evr_man_s1_r4","columns":"1:1"}' AS JSON)
       )
 WHERE id = @evr_man_id
   AND @evr_link_fd IS NOT NULL
   AND JSON_CONTAINS(JSON_EXTRACT(layout_config, '$.sections[0].rows'), CAST('{"id":"evr_man_s1_r4"}' AS JSON)) = 0;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_man_id, @evr_link_fd, @evr_man_order, 1,
       JSON_OBJECT('rowId', 'evr_man_s1_r4', 'colIndex', 0, 'rowIndex', @evr_man_row, 'colSpan', 1)
 WHERE @evr_link_fd IS NOT NULL AND @evr_man_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_man_id AND ff.field_id = @evr_link_fd);

-- ============ 4. Form nội bộ (purpose view) ============
SET @evr_view_id = (
    SELECT id FROM forms
    WHERE entity = 'ev_charging_reports' AND purpose = 'view' AND name = 'Điểm sạc - Xem / sửa'
    ORDER BY id ASC LIMIT 1
);
SET @evr_view_order = (
    SELECT COALESCE(MAX(ff.order_index), -1) + 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id
);
SET @evr_view_row = (
    SELECT COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowIndex')) AS UNSIGNED)), -1) + 1
      FROM form_fields ff WHERE ff.form_id = @evr_view_id
);

UPDATE forms
   SET layout_config = JSON_ARRAY_APPEND(
           layout_config,
           '$.sections[0].rows',
           CAST('{"id":"evr_view_s1_r6","columns":"1:1"}' AS JSON)
       )
 WHERE id = @evr_view_id
   AND @evr_link_fd IS NOT NULL
   AND JSON_CONTAINS(JSON_EXTRACT(layout_config, '$.sections[0].rows'), CAST('{"id":"evr_view_s1_r6"}' AS JSON)) = 0;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, @evr_link_fd, @evr_view_order, 1,
       JSON_OBJECT('rowId', 'evr_view_s1_r6', 'colIndex', 0, 'rowIndex', @evr_view_row, 'colSpan', 1)
 WHERE @evr_link_fd IS NOT NULL AND @evr_view_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = @evr_link_fd);
