-- 166-hang-xe-datalist.sql
-- Kế hoạch 78: chuyển field `hang_xe` của ev_charging_reports từ options thủ công
-- sang Data List `dm_hang_xe` (thêm hãng mới không cần sửa field definition).
-- Idempotent (an toàn khi chạy lại):
--   1) tạo data list nếu thiếu
--   2) chuẩn hoá giá trị viết sai 'Vinfast' -> 'VinFast'
--   3) seed 8 hãng theo giá trị (bỏ qua giá trị đã có)
--   4) trỏ field hang_xe sang data list + bỏ `options` (nếu còn `options`,
--      validateDynamicFields sẽ từ chối hãng mới thêm sau này)
-- Không sửa entity/bảng khác. Không DROP/CREATE lại.

-- ============ 1. Đảm bảo data list dm_hang_xe tồn tại ============
INSERT INTO data_lists (name, description, columns_config)
SELECT 'dm_hang_xe', 'Danh mục hãng xe điện (nhu cầu sạc xe)', '[{"key":"hang_xe","type":"text","label":"Hãng Xe"}]'
WHERE NOT EXISTS (SELECT 1 FROM data_lists WHERE name = 'dm_hang_xe');

SET @hx_dl = (SELECT id FROM data_lists WHERE name = 'dm_hang_xe' ORDER BY id ASC LIMIT 1);

-- ============ 2. Chuẩn hoá giá trị viết sai ============
UPDATE data_list_rows
SET data = JSON_SET(data, '$.hang_xe', 'VinFast')
WHERE list_id = @hx_dl
  AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) = 'Vinfast';

-- ============ 3. Seed hãng xe (idempotent theo giá trị) ============
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @hx_dl, '{"hang_xe":"VinFast"}', 0
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @hx_dl AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) = 'VinFast');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @hx_dl, '{"hang_xe":"Yadea"}', 1
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @hx_dl AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) = 'Yadea');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @hx_dl, '{"hang_xe":"Dat Bike"}', 2
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @hx_dl AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) = 'Dat Bike');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @hx_dl, '{"hang_xe":"Pega"}', 3
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @hx_dl AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) = 'Pega');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @hx_dl, '{"hang_xe":"Tesla"}', 4
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @hx_dl AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) = 'Tesla');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @hx_dl, '{"hang_xe":"BYD"}', 5
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @hx_dl AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) = 'BYD');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @hx_dl, '{"hang_xe":"Wuling"}', 6
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @hx_dl AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) = 'Wuling');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @hx_dl, '{"hang_xe":"Hãng khác"}', 7
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @hx_dl AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) = 'Hãng khác');

-- Xếp lại thứ tự hiển thị theo danh mục chuẩn cho các hãng đã biết
UPDATE data_list_rows
SET sort_order = FIELD(
    JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')),
    'VinFast', 'Yadea', 'Dat Bike', 'Pega', 'Tesla', 'BYD', 'Wuling', 'Hãng khác'
) - 1
WHERE list_id = @hx_dl
  AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.hang_xe')) IN
      ('VinFast', 'Yadea', 'Dat Bike', 'Pega', 'Tesla', 'BYD', 'Wuling', 'Hãng khác');

-- ============ 4. Trỏ field hang_xe sang data list, bỏ options thủ công ============
UPDATE field_definitions
SET data_list_id = @hx_dl,
    data_list_column = 'hang_xe',
    `options` = NULL
WHERE entity = 'ev_charging_reports' AND `key` = 'hang_xe';
