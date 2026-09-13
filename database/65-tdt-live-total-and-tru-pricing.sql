-- -*- coding: utf-8 -*-
-- 65: TDT tổng chi phí tính live (pre) + DataList loại trụ có giá + autofill đơn giá trong bảng

-- 1. Tổng chi phí tính trên form (pre), BE chỉ recompute/validate lại
UPDATE field_definitions
   SET formula_config = JSON_SET(formula_config, '$.compute_mode', 'pre'),
       updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'tdt_tong_cong';

-- 2. dm_loai_tru: thêm cột giá (tạm, sửa giá thật sau)
SET @dl_loai_tru := (SELECT id FROM data_lists WHERE name = 'dm_loai_tru');

UPDATE data_lists
   SET columns_config = JSON_ARRAY(
         JSON_OBJECT('key', 'ma', 'label', 'Mã', 'type', 'text'),
         JSON_OBJECT('key', 'ten', 'label', 'Tên', 'type', 'text'),
         JSON_OBJECT('key', 'gia', 'label', 'Đơn giá', 'type', 'number', 'number_format', 'dot')
       ),
       updated_at = NOW()
 WHERE name = 'dm_loai_tru';

DELETE FROM data_list_rows WHERE list_id = @dl_loai_tru;
INSERT INTO data_list_rows (list_id, data, sort_order) VALUES
  (@dl_loai_tru, JSON_OBJECT('ma', 'CCS2_60',  'ten', 'CCS2 60kW',  'gia', 180000000), 1),
  (@dl_loai_tru, JSON_OBJECT('ma', 'CCS2_120', 'ten', 'CCS2 120kW', 'gia', 290000000), 2),
  (@dl_loai_tru, JSON_OBJECT('ma', 'CCS2_240', 'ten', 'CCS2 240kW', 'gia', 400000000), 3);

-- 3. Cột bảng tdt_tru: loại trụ lấy từ DataList, đơn giá tự điền theo loại trụ
UPDATE field_definitions
   SET source_config = JSON_OBJECT(
         'columns', JSON_ARRAY(
           JSON_OBJECT('key', 'loai_tru', 'label', 'Loại trụ', 'column_type', 'select', 'width', 200,
                       'data_list_id', @dl_loai_tru, 'data_list_column', 'ten'),
           JSON_OBJECT('key', 'so_luong', 'label', 'Số lượng', 'column_type', 'number', 'width', 100),
           JSON_OBJECT('key', 'don_gia', 'label', 'Đơn giá', 'column_type', 'number', 'width', 140,
                       'autofill_from', 'loai_tru', 'autofill_column', 'gia'),
           JSON_OBJECT('key', 'thanh_tien', 'label', 'Thành tiền', 'column_type', 'number', 'width', 140,
                       'formula', 'so_luong * don_gia')
         ),
         'min_rows', 0, 'max_rows', 20
       ),
       updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'tdt_tru';
