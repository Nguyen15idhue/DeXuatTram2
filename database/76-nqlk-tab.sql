-- 76: Mo hinh NQ_LK + tab long trong form de xuat (docs/5/42)
-- - Them option NQ_LK vao mo_hinh_dau_tu
-- - Them 11 field moi cho 2 tab con (Nhuong quyen / Lien ket)
-- - Gan field vao form create (13) + view (14) + them row + phan tu type:'tabs'
-- Idempotent, khong DROP, khong doi key/type field dang map 1Office.

-- ============ 1. Option NQ_LK ============
UPDATE field_definitions
   SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
        'value', 'NQ_LK', 'label', 'Nhượng quyền + Liên kết', 'color', '#0ea5e9', 'borderRadius', 'rounded'))
 WHERE entity = 'station_proposals' AND `key` = 'mo_hinh_dau_tu'
   AND JSON_SEARCH(options, 'one', 'NQ_LK') IS NULL;

-- ============ 2. Field moi ============
-- 2.1. Chinh sach (select) - NQ
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, options, option_style)
SELECT 'station_proposals', 'chinh_sach_nq', 'Chính sách', 'select', 'json', 0, 'active',
  '[{"value":"Trả thẳng","label":"Trả thẳng","color":"#666666","borderRadius":"rounded"},{"value":"Hỗ trợ trả góp từ TMT-Egreen","label":"Hỗ trợ trả góp từ TMT-Egreen","color":"#666666","borderRadius":"rounded"}]',
  '{"defaultColor":"#666666","defaultBorderRadius":"rounded"}'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='chinh_sach_nq');

-- 2.2. Chinh sach (select) - LK
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, options, option_style)
SELECT 'station_proposals', 'chinh_sach_lk', 'Chính sách', 'select', 'json', 0, 'active',
  '[{"value":"Trả thẳng","label":"Trả thẳng","color":"#666666","borderRadius":"rounded"},{"value":"Hỗ trợ trả góp từ TMT-Egreen","label":"Hỗ trợ trả góp từ TMT-Egreen","color":"#666666","borderRadius":"rounded"}]',
  '{"defaultColor":"#666666","defaultBorderRadius":"rounded"}'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='chinh_sach_lk');

-- 2.3. Bang loai tru (copy source_config cua tdt_tru de co autofill gia)
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, source_config)
SELECT 'station_proposals', 'loai_tru_nq', 'Loại trụ', 'table', 'json', 1, 'active', fd.source_config
FROM field_definitions fd
WHERE fd.entity='station_proposals' AND fd.`key`='tdt_tru'
  AND NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='loai_tru_nq');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, source_config)
SELECT 'station_proposals', 'loai_tru_lk', 'Loại trụ', 'table', 'json', 1, 'active', fd.source_config
FROM field_definitions fd
WHERE fd.entity='station_proposals' AND fd.`key`='tdt_tru'
  AND NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='loai_tru_lk');

-- 2.4. Chi phi (number) - LK
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, number_format, decimal_places, display_format)
SELECT 'station_proposals', 'chi_phi_van_chuyen', 'Chi phí vận chuyển', 'number', 'json', 1, 'active', 'integer', 0, 'dot'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='chi_phi_van_chuyen');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, number_format, decimal_places, display_format)
SELECT 'station_proposals', 'chi_phi_tram_bien_ap', 'Chi phí trạm biến áp', 'number', 'json', 1, 'active', 'integer', 0, 'dot'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='chi_phi_tram_bien_ap');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, number_format, decimal_places, display_format)
SELECT 'station_proposals', 'chi_phi_ha_tang', 'Chi phí hạ tầng', 'number', 'json', 1, 'active', 'integer', 0, 'dot'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='chi_phi_ha_tang');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, number_format, decimal_places, display_format)
SELECT 'station_proposals', 'chi_phi_thue_vi_tri', 'Chi phí thuê vị trí', 'number', 'json', 1, 'active', 'integer', 0, 'dot'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='chi_phi_thue_vi_tri');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, number_format, decimal_places, display_format)
SELECT 'station_proposals', 'dat_coc', 'Đặt cọc', 'number', 'json', 0, 'active', 'integer', 0, 'dot'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='dat_coc');

-- 2.5. Ghi chu dat coc (textarea)
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
SELECT 'station_proposals', 'ghi_chu_dat_coc', 'Ghi chú về khoản cọc', 'textarea', 'json', 0, 'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='ghi_chu_dat_coc');

-- 2.6. Tong chi phi (formula pre-compute, giong tdt_tong_cong)
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status, formula_config)
SELECT 'station_proposals', 'tong_chi_phi', 'Tổng chi phí', 'formula', 'json', 0, 'active',
  '{"expression":"TABLE_SUM(loai_tru_lk.thanh_tien) + chi_phi_van_chuyen + chi_phi_tram_bien_ap + chi_phi_ha_tang + chi_phi_thue_vi_tri","outputType":"number","compute_mode":"pre","numberFormat":"dot","decimalPlaces":0,"unit":"VND","referencedFields":["loai_tru_lk","chi_phi_van_chuyen","chi_phi_tram_bien_ap","chi_phi_ha_tang","chi_phi_thue_vi_tri"]}'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity='station_proposals' AND `key`='tong_chi_phi');

-- ============ 3. Them row vao section LK (s5) / NQ (s6) - form 13 (create) ============
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_create_s5_r6','columns','1:1'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s5_r6') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_create_s5_r7','columns','1:1'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s5_r7') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_create_s5_r8','columns','1:2'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s5_r8') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_create_s5_r9','columns','1:2'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s5_r9') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_create_s5_r10','columns','1:2'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s5_r10') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_create_s5_r11','columns','1:2'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s5_r11') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_create_s5_r12','columns','1:2'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s5_r12') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_create_s5_r13','columns','1:1'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s5_r13') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_create_s5_r14','columns','1:1'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s5_r14') IS NULL;

UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[5].rows', JSON_OBJECT('id','station_proposals_create_s6_r7','columns','1:1'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s6_r7') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[5].rows', JSON_OBJECT('id','station_proposals_create_s6_r8','columns','1:1'))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','station_proposals_create_s6_r8') IS NULL;

-- ============ 4. Them row vao section LK (s5) / NQ (s6) - form 14 (view) ============
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_view_s5_r6','columns','1:1'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s5_r6') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_view_s5_r7','columns','1:1'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s5_r7') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_view_s5_r8','columns','1:2'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s5_r8') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_view_s5_r9','columns','1:2'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s5_r9') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_view_s5_r10','columns','1:2'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s5_r10') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_view_s5_r11','columns','1:2'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s5_r11') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_view_s5_r12','columns','1:2'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s5_r12') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_view_s5_r13','columns','1:1'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s5_r13') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[4].rows', JSON_OBJECT('id','station_proposals_view_s5_r14','columns','1:1'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s5_r14') IS NULL;

UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[5].rows', JSON_OBJECT('id','station_proposals_view_s6_r7','columns','1:1'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s6_r7') IS NULL;
UPDATE forms SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[5].rows', JSON_OBJECT('id','station_proposals_view_s6_r8','columns','1:1'))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','station_proposals_view_s6_r8') IS NULL;

-- ============ 5. Them phan tu type:'tabs' vao sections (chen sau s6, index 7) ============
UPDATE forms
   SET layout_config = JSON_ARRAY_INSERT(layout_config, '$.sections[7]', JSON_OBJECT(
        'id','tai_chinh_nqlk',
        'type','tabs',
        'title','Nhượng quyền và Liên kết',
        'collapsible', false,
        'rows', JSON_ARRAY(),
        'visibleWhen', JSON_OBJECT('field','mo_hinh_dau_tu','value','NQ_LK'),
        'tabs', JSON_ARRAY(
          JSON_OBJECT('id','nqlk_nq','title','Nhượng quyền','sectionRefs', JSON_ARRAY('station_proposals_create_s6')),
          JSON_OBJECT('id','nqlk_lk','title','Liên kết','sectionRefs', JSON_ARRAY('station_proposals_create_s5'))
        )))
 WHERE id=13 AND JSON_SEARCH(layout_config,'one','tai_chinh_nqlk') IS NULL;

UPDATE forms
   SET layout_config = JSON_ARRAY_INSERT(layout_config, '$.sections[7]', JSON_OBJECT(
        'id','tai_chinh_nqlk',
        'type','tabs',
        'title','Nhượng quyền và Liên kết',
        'collapsible', false,
        'rows', JSON_ARRAY(),
        'visibleWhen', JSON_OBJECT('field','mo_hinh_dau_tu','value','NQ_LK'),
        'tabs', JSON_ARRAY(
          JSON_OBJECT('id','nqlk_nq','title','Nhượng quyền','sectionRefs', JSON_ARRAY('station_proposals_view_s6')),
          JSON_OBJECT('id','nqlk_lk','title','Liên kết','sectionRefs', JSON_ARRAY('station_proposals_view_s5'))
        )))
 WHERE id=14 AND JSON_SEARCH(layout_config,'one','tai_chinh_nqlk') IS NULL;

-- ============ 6. Gan field vao form 13 (create) ============
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s6_r7","colSpan":1,"colIndex":0,"rowIndex":6,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chinh_sach_nq'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s6_r8","colSpan":1,"colIndex":0,"rowIndex":7,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='loai_tru_nq'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r6","colSpan":1,"colIndex":0,"rowIndex":5,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chinh_sach_lk'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r7","colSpan":1,"colIndex":0,"rowIndex":6,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='loai_tru_lk'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r8","colSpan":1,"colIndex":0,"rowIndex":7,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_van_chuyen'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r9","colSpan":1,"colIndex":0,"rowIndex":8,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_tram_bien_ap'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r10","colSpan":1,"colIndex":0,"rowIndex":9,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_ha_tang'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r11","colSpan":1,"colIndex":0,"rowIndex":10,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_thue_vi_tri'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r12","colSpan":1,"colIndex":0,"rowIndex":11,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='dat_coc'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r13","colSpan":1,"colIndex":0,"rowIndex":12,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='ghi_chu_dat_coc'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 13, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=13),0)+1, 1,
  '{"rowId":"station_proposals_create_s5_r14","colSpan":1,"colIndex":0,"rowIndex":13,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='tong_chi_phi'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=13 AND ff.field_id=fd.id);

-- ============ 7. Gan field vao form 14 (view) ============
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s6_r7","colSpan":1,"colIndex":0,"rowIndex":6,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chinh_sach_nq'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s6_r8","colSpan":1,"colIndex":0,"rowIndex":7,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='loai_tru_nq'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r6","colSpan":1,"colIndex":0,"rowIndex":5,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chinh_sach_lk'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r7","colSpan":1,"colIndex":0,"rowIndex":6,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='loai_tru_lk'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r8","colSpan":1,"colIndex":0,"rowIndex":7,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_van_chuyen'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r9","colSpan":1,"colIndex":0,"rowIndex":8,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_tram_bien_ap'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r10","colSpan":1,"colIndex":0,"rowIndex":9,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_ha_tang'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r11","colSpan":1,"colIndex":0,"rowIndex":10,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='chi_phi_thue_vi_tri'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r12","colSpan":1,"colIndex":0,"rowIndex":11,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='dat_coc'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r13","colSpan":1,"colIndex":0,"rowIndex":12,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='ghi_chu_dat_coc'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id=14),0)+1, 1,
  '{"rowId":"station_proposals_view_s5_r14","colSpan":1,"colIndex":0,"rowIndex":13,"conditions":[{"field":"mo_hinh_dau_tu","value":"NQ_LK","operator":"="}]}'
FROM field_definitions fd WHERE fd.entity='station_proposals' AND fd.`key`='tong_chi_phi'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id=14 AND ff.field_id=fd.id);

-- ============ 8. Kiem tra ============
SELECT 'new_fields' AS metric, COUNT(*) AS n FROM field_definitions
 WHERE entity='station_proposals' AND `key` IN ('chinh_sach_nq','loai_tru_nq','chinh_sach_lk','loai_tru_lk','chi_phi_van_chuyen','chi_phi_tram_bien_ap','chi_phi_ha_tang','chi_phi_thue_vi_tri','dat_coc','ghi_chu_dat_coc','tong_chi_phi');
SELECT 'form13_tabs' AS metric, JSON_EXTRACT(layout_config,'$.sections[*].type') AS v FROM forms WHERE id=13;
SELECT 'form14_tabs' AS metric, JSON_EXTRACT(layout_config,'$.sections[*].type') AS v FROM forms WHERE id=14;
