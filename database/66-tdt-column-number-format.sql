-- -*- coding: utf-8 -*-
-- 66: Đặt kiểu hiển thị số (dot = 1.000) cho các cột tiền trong bảng TDT
SET @dl_loai_tru := (SELECT id FROM data_lists WHERE name = 'dm_loai_tru');

UPDATE field_definitions
   SET source_config = JSON_OBJECT(
         'columns', JSON_ARRAY(
           JSON_OBJECT('key', 'loai_tru', 'label', 'Loại trụ', 'column_type', 'select', 'width', 200,
                       'data_list_id', @dl_loai_tru, 'data_list_column', 'ten'),
           JSON_OBJECT('key', 'so_luong', 'label', 'Số lượng', 'column_type', 'number', 'width', 100),
           JSON_OBJECT('key', 'don_gia', 'label', 'Đơn giá', 'column_type', 'number', 'width', 140,
                       'display_format', 'dot', 'autofill_from', 'loai_tru', 'autofill_column', 'gia'),
           JSON_OBJECT('key', 'thanh_tien', 'label', 'Thành tiền', 'column_type', 'number', 'width', 140,
                       'display_format', 'dot', 'formula', 'so_luong * don_gia')
         ),
         'min_rows', 0, 'max_rows', 20
       ),
       updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'tdt_tru';

UPDATE field_definitions
   SET source_config = JSON_SET(source_config, '$.columns[1].display_format', 'dot'),
       updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'tdt_chi_phi_khac';
