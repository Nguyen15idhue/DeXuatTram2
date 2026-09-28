-- 114: chi_phi_lk.so_tien nhap thu cong - go autofill/data_link, khoi phuc footer SUM.
-- Nguon: tdt_chi_phi_khac.so_tien (tuong duong manual) khong co autofill/data_link.
-- Hien trang loi: so_tien co autofill_from=loai_chi_phi + autofill_column=gia + data_link(enabled=false,
-- trigger loai_chi_phi) -> FE/BE hieu la price-link -> tu dien + khoa o nhap thanh select.
-- + footer_formula bi null (mat dong tong) do sua bang FieldManager.
-- Idempotent, khong DROP.

UPDATE field_definitions
   SET source_config = JSON_REMOVE(source_config, '$.columns[1].autofill_from', '$.columns[1].autofill_column', '$.columns[1].data_link')
 WHERE entity = 'station_proposals' AND `key` = 'chi_phi_lk'
   AND JSON_EXTRACT(source_config, '$.columns[1].key') = 'so_tien'
   AND (JSON_CONTAINS_PATH(source_config, 'one', '$.columns[1].autofill_from')
        OR JSON_CONTAINS_PATH(source_config, 'one', '$.columns[1].autofill_column')
        OR JSON_CONTAINS_PATH(source_config, 'one', '$.columns[1].data_link'));

UPDATE field_definitions
   SET source_config = JSON_SET(source_config, '$.columns[1].footer_formula', 'SUM')
 WHERE entity = 'station_proposals' AND `key` = 'chi_phi_lk'
   AND JSON_EXTRACT(source_config, '$.columns[1].key') = 'so_tien'
   AND (JSON_EXTRACT(source_config, '$.columns[1].footer_formula') IS NULL
        OR JSON_UNQUOTE(JSON_EXTRACT(source_config, '$.columns[1].footer_formula')) != 'SUM');

SELECT 'chi_phi_lk_114' AS metric, JSON_EXTRACT(source_config, '$.columns') AS cols
FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'chi_phi_lk';
