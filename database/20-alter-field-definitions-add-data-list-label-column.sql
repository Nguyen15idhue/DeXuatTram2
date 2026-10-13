-- 20-alter-field-definitions-add-data-list-label-column.sql
-- Yeu cau 1 (21.Checkloctrung_kehoach.md): cot label hien thi cho select tu Data List
-- VD field ma_tinh: value tu cot ma_tinh, label hien thi tu cot ten_tinh
ALTER TABLE field_definitions ADD COLUMN data_list_label_column VARCHAR(100) NULL AFTER data_list_column;

UPDATE field_definitions
SET data_list_label_column = 'ten_tinh'
WHERE entity = 'station_proposals' AND `key` = 'ma_tinh';
