-- 138: Seed sealed C0 options for the Lead domain.
-- Contract: docs/8/mkt/00-business-decisions.md and 02-database-contract.md
-- Rollback: remove only these named lists/rows before they are used by Lead data.
-- Idempotent. Existing lists and rows are never overwritten.

INSERT INTO data_lists (name, description, columns_config)
SELECT 'MKT Lead Routing', 'Mapping vùng miền Lead sang phòng ban',
       '[{"key":"vung_mien","label":"Vùng miền","type":"text"},{"key":"department","label":"Phòng ban","type":"text"},{"key":"active","label":"Đang dùng","type":"boolean"}]'
WHERE NOT EXISTS (SELECT 1 FROM data_lists WHERE name = 'MKT Lead Routing');
SET @routing_list_id = (SELECT id FROM data_lists WHERE name = 'MKT Lead Routing');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @routing_list_id, '{"vung_mien":"Bắc","department":"Trung tâm KD miền Bắc","active":true}', 1
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @routing_list_id AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.vung_mien')) = 'Bắc');
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @routing_list_id, '{"vung_mien":"Trung","department":"Trung tâm KD miền Trung","active":true}', 2
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @routing_list_id AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.vung_mien')) = 'Trung');
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @routing_list_id, '{"vung_mien":"Nam","department":"Trung tâm KD miền Nam","active":true}', 3
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @routing_list_id AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.vung_mien')) = 'Nam');

INSERT INTO data_lists (name, description, columns_config)
SELECT 'MKT Lead Customer Type', 'Đối tượng Lead',
       '[{"key":"value","label":"Giá trị","type":"text"},{"key":"label","label":"Nhãn","type":"text"}]'
WHERE NOT EXISTS (SELECT 1 FROM data_lists WHERE name = 'MKT Lead Customer Type');
SET @customer_type_list_id = (SELECT id FROM data_lists WHERE name = 'MKT Lead Customer Type');
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @customer_type_list_id, '{"value":"Hộ KD","label":"Hộ KD"}', 1
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @customer_type_list_id AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.value')) = 'Hộ KD');
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @customer_type_list_id, '{"value":"Công ty","label":"Công ty"}', 2
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @customer_type_list_id AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.value')) = 'Công ty');
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @customer_type_list_id, '{"value":"Cá nhân","label":"Cá nhân"}', 3
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id = @customer_type_list_id AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.value')) = 'Cá nhân');

INSERT INTO data_lists (name, description, columns_config)
SELECT 'MKT Lead Source', 'Nguồn Lead',
       '[{"key":"value","label":"Giá trị","type":"text"},{"key":"label","label":"Nhãn","type":"text"}]'
WHERE NOT EXISTS (SELECT 1 FROM data_lists WHERE name = 'MKT Lead Source');
SET @source_list_id = (SELECT id FROM data_lists WHERE name = 'MKT Lead Source');
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @source_list_id, CONCAT('{"value":"', value, '","label":"', value, '"}'), sort_order
FROM (
  SELECT 'FB Lead' AS value, 1 AS sort_order UNION ALL
  SELECT 'FB Mess', 2 UNION ALL
  SELECT 'Youtube', 3 UNION ALL
  SELECT 'Tiktok', 4 UNION ALL
  SELECT 'Website', 5 UNION ALL
  SELECT 'Hotline', 6 UNION ALL
  SELECT 'Khác', 7
) AS options
WHERE NOT EXISTS (
  SELECT 1 FROM data_list_rows r
  WHERE r.list_id = @source_list_id
    AND JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.value')) = options.value
);

INSERT INTO data_lists (name, description, columns_config)
SELECT 'MKT Lead Customer Classification', 'Phân loại khách hàng Lead',
       '[{"key":"value","label":"Giá trị","type":"text"},{"key":"label","label":"Nhãn","type":"text"}]'
WHERE NOT EXISTS (SELECT 1 FROM data_lists WHERE name = 'MKT Lead Customer Classification');
SET @classification_list_id = (SELECT id FROM data_lists WHERE name = 'MKT Lead Customer Classification');
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @classification_list_id, CONCAT('{"value":"', value, '","label":"', value, '"}'), sort_order
FROM (
  SELECT 'Tiềm năng' AS value, 1 AS sort_order UNION ALL
  SELECT 'Quan tâm', 2 UNION ALL
  SELECT 'Theo dõi thêm', 3 UNION ALL
  SELECT 'Không chất lượng', 4
) AS options
WHERE NOT EXISTS (
  SELECT 1 FROM data_list_rows r
  WHERE r.list_id = @classification_list_id
    AND JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.value')) = options.value
);

INSERT INTO data_lists (name, description, columns_config)
SELECT 'MKT Lead CSKH Contact Status', 'Tình trạng liên hệ CSKH của Lead',
       '[{"key":"value","label":"Giá trị","type":"text"},{"key":"label","label":"Nhãn","type":"text"}]'
WHERE NOT EXISTS (SELECT 1 FROM data_lists WHERE name = 'MKT Lead CSKH Contact Status');
SET @cskh_list_id = (SELECT id FROM data_lists WHERE name = 'MKT Lead CSKH Contact Status');
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @cskh_list_id, CONCAT('{"value":"', value, '","label":"', value, '"}'), sort_order
FROM (
  SELECT 'Nghe máy liên hệ thành công' AS value, 1 AS sort_order UNION ALL
  SELECT 'Nghe máy đang bận hẹn gọi lại', 2 UNION ALL
  SELECT 'Không nghe máy/Từ chối nghe máy', 3 UNION ALL
  SELECT 'Máy bận', 4 UNION ALL
  SELECT 'Không liên lạc được (Tắt máy/Ngoài vùng)', 5 UNION ALL
  SELECT 'Sai số điện thoại', 6
) AS options
WHERE NOT EXISTS (
  SELECT 1 FROM data_list_rows r
  WHERE r.list_id = @cskh_list_id
    AND JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.value')) = options.value
);

INSERT INTO data_lists (name, description, columns_config)
SELECT 'MKT Lead TVBH Status', 'Tình trạng TVBH của Lead',
       '[{"key":"value","label":"Giá trị","type":"text"},{"key":"label","label":"Nhãn","type":"text"}]'
WHERE NOT EXISTS (SELECT 1 FROM data_lists WHERE name = 'MKT Lead TVBH Status');
SET @tvbh_list_id = (SELECT id FROM data_lists WHERE name = 'MKT Lead TVBH Status');
INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT @tvbh_list_id, CONCAT('{"value":"', value, '","label":"', value, '"}'), sort_order
FROM (
  SELECT 'Chưa tư vấn' AS value, 1 AS sort_order UNION ALL
  SELECT 'Đang tư vấn', 2 UNION ALL
  SELECT 'Đã gửi báo giá', 3 UNION ALL
  SELECT 'Đang đàm phán', 4 UNION ALL
  SELECT 'Hẹn lại', 5 UNION ALL
  SELECT 'Thành công', 6 UNION ALL
  SELECT 'Không thành công', 7
) AS options
WHERE NOT EXISTS (
  SELECT 1 FROM data_list_rows r
  WHERE r.list_id = @tvbh_list_id
    AND JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.value')) = options.value
);
