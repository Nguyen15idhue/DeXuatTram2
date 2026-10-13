-- -*- coding: utf-8 -*-
-- 60: Chuẩn hóa field Proposals — field mới, required, TDT 2 bảng + formula, cascade chia LN
-- Bước 2 của docs/5/38.ChuanHoaFields3Entity_kehoach.md

-- ============================================================
-- 1. Field mới: Đăng ký kinh doanh + CCCD (chủ hkd)
-- ============================================================
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, file_config)
SELECT 'station_proposals', 'dkkd_cccd_hkd', 'Đăng ký kinh doanh + CCCD (chủ hkd)', 'file', 'json', 0, 'active',
       '{"images":true,"videos":false,"documents":true,"maxSize":10,"multiple":true}'
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'dkkd_cccd_hkd'
);

-- ============================================================
-- 2. Required theo Excel
-- ============================================================
UPDATE field_definitions SET required = 1, updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` IN (
   'address', 'province', 'xa_phuong', 'dien_tich_mat_bang', 'land_type',
   'investment_cost', 'loai_tru', 'nguon_dien',
   'thoi_gian_lap_dat', 'thoi_gian_nghiem_thu', 'legal_document', 'site_images'
 );

-- Toàn bộ LK (lk_*)
UPDATE field_definitions SET required = 1, updated_at = NOW()
 WHERE entity = 'station_proposals' AND LEFT(`key`, 3) = 'lk_';

-- 9/12 field NQ (KHÔNG gồm nq_thanh_toan_lan_1/2/3)
UPDATE field_definitions SET required = 1, updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` IN (
   'nq_gia_niem_yet', 'nq_gia_uu_dai', 'nq_ten_khach_hang', 'nq_mst', 'nq_nguoi_dai_dien',
   'nq_sdt', 'nq_so_tai_khoan', 'nq_chia_loi_nhuan_tmt', 'nq_chia_loi_nhuan_nq'
 );

-- ============================================================
-- 3. TDT -> 2 bảng con + field formula tổng
-- ============================================================
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, source_config, placeholder, help_text)
SELECT 'station_proposals', 'tdt_tru', 'Danh sách trụ (TDT)', 'table', 'json', 1, 'active',
       '{"columns":[{"key":"loai_tru","label":"Loại trụ","column_type":"select","width":180,"options":["CCS2 60kW","CCS2 120kW","CCS2 240kW"]},{"key":"so_luong","label":"Số lượng","column_type":"number","width":100},{"key":"don_gia","label":"Đơn giá","column_type":"number","width":140},{"key":"thanh_tien","label":"Thành tiền","column_type":"number","width":140,"formula":"so_luong * don_gia"}],"min_rows":0,"max_rows":20}',
       'Thêm dòng trụ...', 'Mỗi dòng: loại trụ, số lượng, đơn giá; thành tiền tự tính'
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'tdt_tru'
);

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, source_config, placeholder, help_text)
SELECT 'station_proposals', 'tdt_chi_phi_khac', 'Chi phí khác (TDT)', 'table', 'json', 1, 'active',
       '{"columns":[{"key":"loai_chi_phi","label":"Loại chi phí","column_type":"select","width":220,"options":["Vận chuyển","Trạm biến áp","Hạ tầng","Thuê vị trí"]},{"key":"so_tien","label":"Số tiền","column_type":"number","width":160}],"min_rows":0,"max_rows":20}',
       'Thêm dòng chi phí...', 'Mỗi dòng: loại chi phí, số tiền'
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'tdt_chi_phi_khac'
);

-- Xóa 8 field flat TDT cũ (form_fields/view_fields cascade)
DELETE FROM field_definitions
 WHERE entity = 'station_proposals' AND `key` IN (
   'tdt_tru_ccs2_60kw_sl', 'tdt_tru_ccs2_60kw_dg',
   'tdt_tru_ccs2_120kw_sl', 'tdt_tru_ccs2_120kw_dg',
   'tdt_chi_phi_van_chuyen', 'tdt_chi_phi_tba', 'tdt_chi_phi_ha_tang', 'tdt_chi_phi_thue_vi_tri'
 );

-- Tổng cộng = tổng 2 bảng
UPDATE field_definitions
   SET type = 'formula',
       required = 1,
       formula_config = '{"expression":"TABLE_SUM(tdt_tru.thanh_tien) + TABLE_SUM(tdt_chi_phi_khac.so_tien)","compute_mode":"post","outputType":"number","decimalPlaces":0,"unit":"","referencedFields":[]}',
       updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'tdt_tong_cong';

-- ============================================================
-- 4. Chia LN -> DataList cascade
-- ============================================================
INSERT IGNORE INTO data_lists (name, description, columns_config) VALUES
  ('dm_chia_ln_lk', 'Chia lợi nhuận Liên kết (TMT -> LK)',
   '[{"key":"tmt_lk","label":"Chia LN TMT","type":"text"},{"key":"lk","label":"Chia LN LK","type":"text"}]'),
  ('dm_chia_ln_nq', 'Chia lợi nhuận Nhượng quyền (TMT -> NQ)',
   '[{"key":"tmt_nq","label":"Chia LN TMT","type":"text"},{"key":"nq","label":"Chia LN NQ","type":"text"}]');

SET @dl_lk := (SELECT id FROM data_lists WHERE name = 'dm_chia_ln_lk');
SET @dl_nq := (SELECT id FROM data_lists WHERE name = 'dm_chia_ln_nq');

DELETE FROM data_list_rows WHERE list_id IN (@dl_lk, @dl_nq);
INSERT INTO data_list_rows (list_id, data, sort_order) VALUES
  (@dl_lk, '{"tmt_lk":"1000","lk":"500"}', 1),
  (@dl_lk, '{"tmt_lk":"800","lk":"1000"}', 2),
  (@dl_nq, '{"tmt_nq":"1000","nq":"500"}', 1),
  (@dl_nq, '{"tmt_nq":"800","nq":"1000"}', 2);

UPDATE field_definitions
   SET type = 'select', options = NULL,
       data_list_id = @dl_lk, data_list_column = 'tmt_lk', data_list_label_column = NULL,
       parent_field = NULL, updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'lk_chia_loi_nhuan_tmt';

UPDATE field_definitions
   SET type = 'select', options = NULL,
       data_list_id = @dl_lk, data_list_column = 'lk', data_list_label_column = NULL,
       parent_field = 'tmt_lk', updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'lk_chia_loi_nhuan_lk';

UPDATE field_definitions
   SET type = 'select', options = NULL,
       data_list_id = @dl_nq, data_list_column = 'tmt_nq', data_list_label_column = NULL,
       parent_field = NULL, updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'nq_chia_loi_nhuan_tmt';

UPDATE field_definitions
   SET type = 'select', options = NULL,
       data_list_id = @dl_nq, data_list_column = 'nq', data_list_label_column = NULL,
       parent_field = 'tmt_nq', updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'nq_chia_loi_nhuan_nq';
