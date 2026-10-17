-- 167-ev-report-vehicle-group.sql
-- Kế hoạch 78 (bổ sung): thêm câu hỏi bắt buộc "Quý khách có nhu cầu sạc điện cho
-- nhóm phương tiện nào?" vào form khách chia sẻ điểm sạc xe điện (ev_charging_reports).
--   - Field `nhom_phuong_tien`: type select, source_type json (lưu custom_data),
--     required = 1, 3 lựa chọn thủ công (không cần data list).
--   - Gắn vào 3 form (GPS mặc định / Nhập tay / Xem - sửa) + 1 cột bảng quản trị.
-- Idempotent (an toàn khi chạy lại). Không sửa entity/bảng khác. Không DROP/CREATE lại.

-- ============ 1. Field definition ============
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, `options`, status)
SELECT
    'ev_charging_reports',
    'nhom_phuong_tien',
    'Quý khách có nhu cầu sạc điện cho nhóm phương tiện nào?',
    'select',
    'json',
    1,
    CAST('[{"value":"Xe cá nhân/Gia đình","label":"Xe cá nhân/Gia đình – Phục vụ nhu cầu đi lại cá nhân, gia đình."},{"value":"Xe kinh doanh dịch vụ","label":"Xe kinh doanh dịch vụ – Taxi, xe công nghệ, xe hợp đồng."},{"value":"Xe vận tải hàng hóa","label":"Xe vận tải hàng hóa – Xe Van, xe giao hàng, vận chuyển hàng hóa."}]' AS JSON),
    'active'
WHERE NOT EXISTS (
    SELECT 1 FROM field_definitions
    WHERE entity = 'ev_charging_reports' AND `key` = 'nhom_phuong_tien'
);

SET @npt_fd = (
    SELECT id FROM field_definitions
    WHERE entity = 'ev_charging_reports' AND `key` = 'nhom_phuong_tien'
    ORDER BY id ASC LIMIT 1
);

-- ============ 2. Form khách GPS (purpose create, mặc định) ============
SET @evr_gps_id = (
    SELECT id FROM forms
    WHERE entity = 'ev_charging_reports' AND purpose = 'create' AND name = 'Chia sẻ điểm sạc - GPS'
    ORDER BY id ASC LIMIT 1
);

UPDATE forms
   SET layout_config = JSON_ARRAY_APPEND(
           layout_config,
           '$.sections[1].rows',
           CAST('{"id":"evr_gps_s2_r3","columns":"1:1"}' AS JSON)
       )
 WHERE id = @evr_gps_id
   AND @npt_fd IS NOT NULL
   AND JSON_CONTAINS(JSON_EXTRACT(layout_config, '$.sections[1].rows'), CAST('{"id":"evr_gps_s2_r3"}' AS JSON)) = 0;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_gps_id, @npt_fd, 6, 1, '{"rowId":"evr_gps_s2_r3","colIndex":0,"rowIndex":5,"colSpan":1}'
WHERE @npt_fd IS NOT NULL AND @evr_gps_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_gps_id AND ff.field_id = @npt_fd);

-- ============ 3. Form khách nhập tay (purpose all) ============
SET @evr_man_id = (
    SELECT id FROM forms
    WHERE entity = 'ev_charging_reports' AND purpose = 'all' AND name = 'Chia sẻ điểm sạc - Nhập tay'
    ORDER BY id ASC LIMIT 1
);

UPDATE forms
   SET layout_config = JSON_ARRAY_APPEND(
           layout_config,
           '$.sections[0].rows',
           CAST('{"id":"evr_man_s1_r3","columns":"1:1"}' AS JSON)
       )
 WHERE id = @evr_man_id
   AND @npt_fd IS NOT NULL
   AND JSON_CONTAINS(JSON_EXTRACT(layout_config, '$.sections[0].rows'), CAST('{"id":"evr_man_s1_r3"}' AS JSON)) = 0;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_man_id, @npt_fd, 6, 1, '{"rowId":"evr_man_s1_r3","colIndex":0,"rowIndex":2,"colSpan":1}'
WHERE @npt_fd IS NOT NULL AND @evr_man_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_man_id AND ff.field_id = @npt_fd);

-- ============ 4. Form nội bộ (purpose view) ============
SET @evr_view_id = (
    SELECT id FROM forms
    WHERE entity = 'ev_charging_reports' AND purpose = 'view' AND name = 'Điểm sạc - Xem / sửa'
    ORDER BY id ASC LIMIT 1
);

UPDATE forms
   SET layout_config = JSON_ARRAY_APPEND(
           layout_config,
           '$.sections[0].rows',
           CAST('{"id":"evr_view_s1_r5","columns":"1:1"}' AS JSON)
       )
 WHERE id = @evr_view_id
   AND @npt_fd IS NOT NULL
   AND JSON_CONTAINS(JSON_EXTRACT(layout_config, '$.sections[0].rows'), CAST('{"id":"evr_view_s1_r5"}' AS JSON)) = 0;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @evr_view_id, @npt_fd, 8, 1, '{"rowId":"evr_view_s1_r5","colIndex":0,"rowIndex":4,"colSpan":1}'
WHERE @npt_fd IS NOT NULL AND @evr_view_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @evr_view_id AND ff.field_id = @npt_fd);

-- ============ 5. Cột bảng quản trị (view usage table) ============
SET @evr_tbl = (
    SELECT id FROM views
    WHERE entity = 'ev_charging_reports' AND `usage` = 'table'
    ORDER BY id ASC LIMIT 1
);

SET @npt_vf_exists = (
    SELECT COUNT(*) FROM view_fields
    WHERE view_id = @evr_tbl AND field_id = @npt_fd
);

-- Chèn ngay sau `hang_xe` (order_index 3) -> đẩy các cột phía sau lùi 1
UPDATE view_fields
   SET order_index = order_index + 1
 WHERE view_id = @evr_tbl
   AND order_index >= 3
   AND @npt_fd IS NOT NULL
   AND @npt_vf_exists = 0;

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @evr_tbl, @npt_fd, 3, 1, 240, 1, 1, NULL
WHERE @npt_fd IS NOT NULL AND @evr_tbl IS NOT NULL AND @npt_vf_exists = 0;
