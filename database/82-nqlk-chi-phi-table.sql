-- 82: NQ_LK - gop 4 chi phi (van chuyen/tram bien ap/ha tang/thue vi tri) thanh 1 field TABLE 'chi_phi_lk'
-- + datalist dm_chi_phi_lk co cot gia de tu dien khi chon loai chi phi.
-- Idempotent, khong DROP.

-- ===== 1. Data list dm_chi_phi_lk =====
INSERT INTO data_lists (name, description, columns_config)
SELECT 'dm_chi_phi_lk', 'Loại chi phí Liên kết (NQ_LK)',
  '[{"key":"ma","type":"text","label":"Mã"},{"key":"ten","type":"text","label":"Loại chi phí"},{"key":"gia","type":"number","label":"Đơn giá","number_format":"dot"}]'
WHERE NOT EXISTS (SELECT 1 FROM data_lists WHERE name = 'dm_chi_phi_lk');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT (SELECT id FROM data_lists WHERE name='dm_chi_phi_lk'), '{"ma":"VC","ten":"Vận chuyển","gia":5000000}', 1
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id=(SELECT id FROM data_lists WHERE name='dm_chi_phi_lk') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.ten'))='Vận chuyển');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT (SELECT id FROM data_lists WHERE name='dm_chi_phi_lk'), '{"ma":"TBA","ten":"Trạm biến áp","gia":20000000}', 2
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id=(SELECT id FROM data_lists WHERE name='dm_chi_phi_lk') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.ten'))='Trạm biến áp');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT (SELECT id FROM data_lists WHERE name='dm_chi_phi_lk'), '{"ma":"HT","ten":"Hạ tầng","gia":10000000}', 3
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id=(SELECT id FROM data_lists WHERE name='dm_chi_phi_lk') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.ten'))='Hạ tầng');

INSERT INTO data_list_rows (list_id, data, sort_order)
SELECT (SELECT id FROM data_lists WHERE name='dm_chi_phi_lk'), '{"ma":"TVT","ten":"Thuê vị trí","gia":15000000}', 4
WHERE NOT EXISTS (SELECT 1 FROM data_list_rows WHERE list_id=(SELECT id FROM data_lists WHERE name='dm_chi_phi_lk') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.ten'))='Thuê vị trí');

-- ===== 2. Field table chi_phi_lk =====
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, source_config)
SELECT 'station_proposals', 'chi_phi_lk', 'Chi phí', 'table', 'json', 1, 'active',
  JSON_OBJECT(
    'columns', JSON_ARRAY(
      JSON_OBJECT('key','loai_chi_phi','label','Loại chi phí','width',260,'column_type','select','data_list_id',(SELECT id FROM data_lists WHERE name='dm_chi_phi_lk'),'data_list_column','ten'),
      JSON_OBJECT('key','so_tien','label','Số tiền','width',180,'column_type','number','display_format','dot','autofill_from','loai_chi_phi','autofill_column','gia','footer_formula','SUM')
    ),
    'max_rows', 20,
    'min_rows', 0
  )
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='chi_phi_lk');

-- ===== 3. An 4 field chi phi cu =====
UPDATE field_definitions
   SET status = 'inactive'
 WHERE entity='station_proposals'
   AND `key` IN ('chi_phi_van_chuyen','chi_phi_tram_bien_ap','chi_phi_ha_tang','chi_phi_thue_vi_tri');

-- ===== 4. Bo form_fields cua 4 field cu (ca 2 form) =====
DELETE ff FROM form_fields ff
  JOIN field_definitions fd ON fd.id = ff.field_id
 WHERE ff.form_id IN (13,14)
   AND fd.entity='station_proposals'
   AND fd.`key` IN ('chi_phi_van_chuyen','chi_phi_tram_bien_ap','chi_phi_ha_tang','chi_phi_thue_vi_tri');

-- ===== 5. Dat lai rows section LK (sections[4]) cho form 13/14 =====
UPDATE forms SET layout_config = JSON_SET(layout_config, '$.sections[4].rows', JSON_ARRAY(
  JSON_OBJECT('id','station_proposals_create_s5_r1','columns','1:2'),
  JSON_OBJECT('id','station_proposals_create_s5_r2','columns','1:2'),
  JSON_OBJECT('id','station_proposals_create_s5_r3','columns','1:2'),
  JSON_OBJECT('id','station_proposals_create_s5_r4','columns','1:2'),
  JSON_OBJECT('id','station_proposals_create_s5_r5','columns','1:1'),
  JSON_OBJECT('id','station_proposals_create_s5_r6','columns','1:1'),
  JSON_OBJECT('id','station_proposals_create_s5_r7','columns','1:1'),
  JSON_OBJECT('id','station_proposals_create_s5_r8','columns','1:1'),
  JSON_OBJECT('id','station_proposals_create_s5_r9','columns','1:2'),
  JSON_OBJECT('id','station_proposals_create_s5_r10','columns','1:1'),
  JSON_OBJECT('id','station_proposals_create_s5_r11','columns','1:1')
))
WHERE id=13 AND JSON_EXTRACT(layout_config,'$.sections[4].id')='station_proposals_create_s5';

UPDATE forms SET layout_config = JSON_SET(layout_config, '$.sections[4].rows', JSON_ARRAY(
  JSON_OBJECT('id','station_proposals_view_s5_r1','columns','1:2'),
  JSON_OBJECT('id','station_proposals_view_s5_r2','columns','1:2'),
  JSON_OBJECT('id','station_proposals_view_s5_r3','columns','1:2'),
  JSON_OBJECT('id','station_proposals_view_s5_r4','columns','1:2'),
  JSON_OBJECT('id','station_proposals_view_s5_r5','columns','1:1'),
  JSON_OBJECT('id','station_proposals_view_s5_r6','columns','1:1'),
  JSON_OBJECT('id','station_proposals_view_s5_r7','columns','1:1'),
  JSON_OBJECT('id','station_proposals_view_s5_r8','columns','1:1'),
  JSON_OBJECT('id','station_proposals_view_s5_r9','columns','1:2'),
  JSON_OBJECT('id','station_proposals_view_s5_r10','columns','1:1'),
  JSON_OBJECT('id','station_proposals_view_s5_r11','columns','1:1')
))
WHERE id=14 AND JSON_EXTRACT(layout_config,'$.sections[4].id')='station_proposals_view_s5';

-- ===== 6. Doi rowId cho dat_coc/ghi_chu_dat_coc/tong_chi_phi (r12..r14 -> r9..r11) =====
UPDATE form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id
   SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_create_s5_r9', '$.rowIndex', 8)
 WHERE ff.form_id=13 AND fd.entity='station_proposals' AND fd.`key`='dat_coc';
UPDATE form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id
   SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_create_s5_r10', '$.rowIndex', 9)
 WHERE ff.form_id=13 AND fd.entity='station_proposals' AND fd.`key`='ghi_chu_dat_coc';
UPDATE form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id
   SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_create_s5_r11', '$.rowIndex', 10)
 WHERE ff.form_id=13 AND fd.entity='station_proposals' AND fd.`key`='tong_chi_phi';

UPDATE form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id
   SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_view_s5_r9', '$.rowIndex', 8)
 WHERE ff.form_id=14 AND fd.entity='station_proposals' AND fd.`key`='dat_coc';
UPDATE form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id
   SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_view_s5_r10', '$.rowIndex', 9)
 WHERE ff.form_id=14 AND fd.entity='station_proposals' AND fd.`key`='ghi_chu_dat_coc';
UPDATE form_fields ff JOIN field_definitions fd ON fd.id = ff.field_id
   SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_view_s5_r11', '$.rowIndex', 10)
 WHERE ff.form_id=14 AND fd.entity='station_proposals' AND fd.`key`='tong_chi_phi';

-- ===== 7. Them form_fields cho chi_phi_lk =====
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r8","colSpan":1,"colIndex":0,"rowIndex":7,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_lk'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r8","colSpan":1,"colIndex":0,"rowIndex":7,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_lk'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

-- ===== 8. Cap nhat formula tong_chi_phi =====
UPDATE field_definitions
   SET formula_config = '{"expression":"TABLE_SUM(loai_tru_lk.thanh_tien) + TABLE_SUM(chi_phi_lk.so_tien)","outputType":"number","compute_mode":"pre","numberFormat":"dot","decimalPlaces":0,"unit":"VND","referencedFields":["loai_tru_lk","chi_phi_lk"]}'
 WHERE entity='station_proposals' AND `key`='tong_chi_phi';

-- ===== 9. Desc template: thay 4 chi phi bang chi_phi_lk trong section con 'Lien ket' =====
UPDATE api_configs
   SET desc_template_config = JSON_SET(desc_template_config, '$.sections[8].sections[1].fields',
     JSON_ARRAY('chinh_sach_lk','loai_tru_lk','chi_phi_lk','lk_ty_le_tmt','lk_ty_le_doi_tac','lk_chia_loi_nhuan_tmt','lk_chia_loi_nhuan_lk','dat_coc','ghi_chu_dat_coc','tong_chi_phi'))
 WHERE id=3 AND JSON_EXTRACT(desc_template_config,'$.sections[8].id')='nqlk_desc_parent';

-- ===== Kiem tra =====
SELECT 'chi_phi_lk' AS metric, type, required, JSON_EXTRACT(source_config,'$.columns[*].key') AS cols FROM field_definitions WHERE entity='station_proposals' AND `key`='chi_phi_lk';
SELECT 'old_fields' AS metric, `key`, status FROM field_definitions WHERE entity='station_proposals' AND `key` IN ('chi_phi_van_chuyen','chi_phi_tram_bien_ap','chi_phi_ha_tang','chi_phi_thue_vi_tri');
SELECT 's5_rows_13' AS metric, JSON_LENGTH(layout_config,'$.sections[4].rows') AS n FROM forms WHERE id=13;
SELECT 'desc_lk_fields' AS metric, JSON_EXTRACT(desc_template_config,'$.sections[8].sections[1].fields') AS f FROM api_configs WHERE id=3;
