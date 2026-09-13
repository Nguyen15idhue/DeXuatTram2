-- -*- coding: utf-8 -*-
-- 67: Cấu hình hiển thị trường Tổng cộng chi phí (TDT) — 1.000 VND
UPDATE field_definitions
   SET formula_config = JSON_OBJECT(
         'expression', 'TABLE_SUM(tdt_tru.thanh_tien) + TABLE_SUM(tdt_chi_phi_khac.so_tien)',
         'compute_mode', 'pre',
         'outputType', 'number',
         'numberFormat', 'dot',
         'decimalPlaces', 0,
         'unit', 'VND',
         'referencedFields', JSON_ARRAY('tdt_tru', 'tdt_chi_phi_khac')
       ),
       updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'tdt_tong_cong';
