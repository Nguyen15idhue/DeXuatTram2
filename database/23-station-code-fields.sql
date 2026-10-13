-- 23-station-code-fields.sql
-- Ma tram stations: E.{ma_tinh}{4 so}, dem rieng tung tinh (VD E.HNO0001).
-- province: o Tinh/Thanh pho hien form (select tu dm_tinh, luu ten).
-- ma_tinh: suy server-side (khong hien form), luu custom_data de formula doc.
-- ma_tram: formula post, sinh 1 lan luc tao.

SET @dm_tinh_id = (SELECT id FROM data_lists WHERE name = 'dm_tinh');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, data_list_label_column, status)
VALUES ('stations', 'province', 'Tỉnh/Thành phố', 'select', 'json', 1, @dm_tinh_id, 'ten_tinh', 'ten_tinh', 'active');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, status)
VALUES ('stations', 'ma_tinh', 'Mã tỉnh', 'select', 'json', 0, @dm_tinh_id, 'ma_tinh', 'active');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, formula_config, status)
VALUES ('stations', 'ma_tram', 'Mã trạm', 'formula', 'json', 0,
 '{"compute_mode": "post", "expression": "CONCAT(''E.'', ma_tinh, LPAD(SEQ(CONCAT(''E.'', ma_tinh)), 4, ''0''))", "referencedFields": ["ma_tinh"], "outputType": "text"}',
 'active');

SET @province_fid = (SELECT id FROM field_definitions WHERE entity = 'stations' AND `key` = 'province');
SET @ma_tram_fid = (SELECT id FROM field_definitions WHERE entity = 'stations' AND `key` = 'ma_tram');

INSERT INTO form_fields (form_id, field_id, order_index, visible) VALUES
(7, @province_fid, 9, 1),
(7, @ma_tram_fid, 10, 1);

INSERT INTO view_fields (view_id, field_id, order_index, visible, sortable, filterable) VALUES
(6, @province_fid, 8, 1, 1, 1),
(6, @ma_tram_fid, 9, 1, 1, 1);
