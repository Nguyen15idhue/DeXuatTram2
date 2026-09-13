-- -*- coding: utf-8 -*-
-- 62: Rebuild Forms + Views chuẩn hóa cho 3 entity (SINH TỰ ĐỘNG bởi backend/scripts/gen-forms-views-sql.js)
-- Bước 6 + 7 của docs/5/38.ChuanHoaFields3Entity_kehoach.md
-- Tham chiếu field theo (entity, key) — không hardcode field_id (portable local/VPS).

-- ============ FORM: station_proposals / create ============
INSERT INTO forms (entity, name, description, status, purpose)
SELECT 'station_proposals', 'Form station_proposals - Nhập liệu', 'Form nhập liệu đề xuất trạm', 'active', 'create'
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity='station_proposals' AND purpose='create');

DELETE FROM form_fields WHERE form_id = (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1);
UPDATE forms SET layout_config = '{"rows":[],"sections":[{"id":"station_proposals_create_s1","title":"Thông tin chủ sở hữu","collapsible":false,"rows":[{"id":"station_proposals_create_s1_r1","columns":"1:2"}]},{"id":"station_proposals_create_s2","title":"Vị trí","collapsible":false,"rows":[{"id":"station_proposals_create_s2_r1","columns":"1:2"},{"id":"station_proposals_create_s2_r2","columns":"1:2"},{"id":"station_proposals_create_s2_r3","columns":"1:2"},{"id":"station_proposals_create_s2_r4","columns":"1:2"},{"id":"station_proposals_create_s2_r5","columns":"1:1"}]},{"id":"station_proposals_create_s3","title":"Thông tin đề xuất","collapsible":false,"rows":[{"id":"station_proposals_create_s3_r1","columns":"1:1"},{"id":"station_proposals_create_s3_r2","columns":"1:1"},{"id":"station_proposals_create_s3_r3","columns":"1:2"},{"id":"station_proposals_create_s3_r4","columns":"1:2"},{"id":"station_proposals_create_s3_r5","columns":"1:2"},{"id":"station_proposals_create_s3_r6","columns":"1:1"}]},{"id":"station_proposals_create_s4","title":"Chi phí đầu tư TDT","collapsible":false,"visibleWhen":{"field":"mo_hinh_dau_tu","value":"TDT"},"rows":[{"id":"station_proposals_create_s4_r1","columns":"1:1"},{"id":"station_proposals_create_s4_r2","columns":"1:1"},{"id":"station_proposals_create_s4_r3","columns":"1:1"}]},{"id":"station_proposals_create_s5","title":"Thông tin CĐT Liên kết","collapsible":false,"visibleWhen":{"field":"mo_hinh_dau_tu","value":"LK"},"rows":[{"id":"station_proposals_create_s5_r1","columns":"1:2"},{"id":"station_proposals_create_s5_r2","columns":"1:2"},{"id":"station_proposals_create_s5_r3","columns":"1:2"},{"id":"station_proposals_create_s5_r4","columns":"1:2"},{"id":"station_proposals_create_s5_r5","columns":"1:1"}]},{"id":"station_proposals_create_s6","title":"Thông tin Nhượng quyền","collapsible":false,"visibleWhen":{"field":"mo_hinh_dau_tu","value":"NQ"},"rows":[{"id":"station_proposals_create_s6_r1","columns":"1:2"},{"id":"station_proposals_create_s6_r2","columns":"1:2"},{"id":"station_proposals_create_s6_r3","columns":"1:2"},{"id":"station_proposals_create_s6_r4","columns":"1:2"},{"id":"station_proposals_create_s6_r5","columns":"1:2"},{"id":"station_proposals_create_s6_r6","columns":"1:2"}]},{"id":"station_proposals_create_s7","title":"Hồ sơ & Hình ảnh","collapsible":false,"rows":[{"id":"station_proposals_create_s7_r1","columns":"1:2"},{"id":"station_proposals_create_s7_r2","columns":"1:2"}]},{"id":"station_proposals_create_s8","title":"Thông tin hệ thống","collapsible":false,"rows":[{"id":"station_proposals_create_s8_r1","columns":"1:2"},{"id":"station_proposals_create_s8_r2","columns":"1:2"}]}]}', updated_at = NOW() WHERE entity='station_proposals' AND purpose='create';

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT t.form_id, t.field_id, t.order_index, t.visible, t.config FROM (
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='owner_name' LIMIT 1) AS field_id, 0 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s1_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='owner_phone' LIMIT 1) AS field_id, 1 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s1_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='latitude' LIMIT 1) AS field_id, 2 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s2_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='longitude' LIMIT 1) AS field_id, 3 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s2_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='address' LIMIT 1) AS field_id, 4 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s2_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='province' LIMIT 1) AS field_id, 5 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s2_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='xa_phuong' LIMIT 1) AS field_id, 6 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s2_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='area' LIMIT 1) AS field_id, 7 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s2_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='dien_tich_mat_bang' LIMIT 1) AS field_id, 8 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s2_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='vung_mien' LIMIT 1) AS field_id, 9 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s2_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='land_type' LIMIT 1) AS field_id, 10 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s2_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='description' LIMIT 1) AS field_id, 11 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s3_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='ghi_chu' LIMIT 1) AS field_id, 12 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s3_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='investment_cost' LIMIT 1) AS field_id, 13 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s3_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='loai_tru' LIMIT 1) AS field_id, 14 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s3_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='mo_hinh_dau_tu' LIMIT 1) AS field_id, 15 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s3_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='ma_tinh' LIMIT 1) AS field_id, 16 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s3_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nguon_dien' LIMIT 1) AS field_id, 17 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s3_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='thoi_gian_lap_dat' LIMIT 1) AS field_id, 18 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s3_r5","colSpan":1,"colIndex":1,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='thoi_gian_nghiem_thu' LIMIT 1) AS field_id, 19 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s3_r6","colSpan":1,"colIndex":0,"rowIndex":5}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='tdt_tru' LIMIT 1) AS field_id, 20 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s4_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='tdt_chi_phi_khac' LIMIT 1) AS field_id, 21 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s4_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='tdt_tong_cong' LIMIT 1) AS field_id, 22 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s4_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_ten_phap_nhan' LIMIT 1) AS field_id, 23 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s5_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_mst' LIMIT 1) AS field_id, 24 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s5_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_nguoi_dai_dien' LIMIT 1) AS field_id, 25 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s5_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_sdt' LIMIT 1) AS field_id, 26 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s5_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_dia_chi_dkkd' LIMIT 1) AS field_id, 27 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s5_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_ty_le_tmt' LIMIT 1) AS field_id, 28 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s5_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_ty_le_doi_tac' LIMIT 1) AS field_id, 29 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s5_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_chia_loi_nhuan_tmt' LIMIT 1) AS field_id, 30 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s5_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_chia_loi_nhuan_lk' LIMIT 1) AS field_id, 31 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s5_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_gia_niem_yet' LIMIT 1) AS field_id, 32 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_gia_uu_dai' LIMIT 1) AS field_id, 33 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_ten_khach_hang' LIMIT 1) AS field_id, 34 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_mst' LIMIT 1) AS field_id, 35 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_nguoi_dai_dien' LIMIT 1) AS field_id, 36 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_sdt' LIMIT 1) AS field_id, 37 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_so_tai_khoan' LIMIT 1) AS field_id, 38 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_chia_loi_nhuan_tmt' LIMIT 1) AS field_id, 39 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_chia_loi_nhuan_nq' LIMIT 1) AS field_id, 40 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_thanh_toan_lan_1' LIMIT 1) AS field_id, 41 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r5","colSpan":1,"colIndex":1,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_thanh_toan_lan_2' LIMIT 1) AS field_id, 42 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r6","colSpan":1,"colIndex":0,"rowIndex":5}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_thanh_toan_lan_3' LIMIT 1) AS field_id, 43 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s6_r6","colSpan":1,"colIndex":1,"rowIndex":5}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='legal_document' LIMIT 1) AS field_id, 44 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s7_r1","colSpan":1,"colIndex":0,"rowIndex":0,"conditions":[{"field":"mo_hinh_dau_tu","operator":"=","value":"TDT"},{"field":"mo_hinh_dau_tu","operator":"=","value":"LK"}],"conditionLogic":"OR"}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='site_images' LIMIT 1) AS field_id, 45 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s7_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='phap_ly_dat' LIMIT 1) AS field_id, 46 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s7_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='dkkd_cccd_hkd' LIMIT 1) AS field_id, 47 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s7_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='status' LIMIT 1) AS field_id, 48 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s8_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='ma_de_xuat' LIMIT 1) AS field_id, 49 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s8_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nguoi_de_xuat' LIMIT 1) AS field_id, 50 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s8_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='sales_quan_ly' LIMIT 1) AS field_id, 51 AS order_index, 1 AS visible, '{"rowId":"station_proposals_create_s8_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
) t WHERE t.form_id IS NOT NULL AND t.field_id IS NOT NULL;

-- ============ FORM: station_proposals / view ============
INSERT INTO forms (entity, name, description, status, purpose)
SELECT 'station_proposals', 'Form station_proposals - Xem/sửa', 'Form xem/sửa đề xuất trạm', 'active', 'view'
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity='station_proposals' AND purpose='view');

DELETE FROM form_fields WHERE form_id = (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1);
UPDATE forms SET layout_config = '{"rows":[],"sections":[{"id":"station_proposals_view_s1","title":"Thông tin chủ sở hữu","collapsible":false,"rows":[{"id":"station_proposals_view_s1_r1","columns":"1:2"}]},{"id":"station_proposals_view_s2","title":"Vị trí","collapsible":false,"rows":[{"id":"station_proposals_view_s2_r1","columns":"1:2"},{"id":"station_proposals_view_s2_r2","columns":"1:2"},{"id":"station_proposals_view_s2_r3","columns":"1:2"},{"id":"station_proposals_view_s2_r4","columns":"1:2"},{"id":"station_proposals_view_s2_r5","columns":"1:1"}]},{"id":"station_proposals_view_s3","title":"Thông tin đề xuất","collapsible":false,"rows":[{"id":"station_proposals_view_s3_r1","columns":"1:1"},{"id":"station_proposals_view_s3_r2","columns":"1:1"},{"id":"station_proposals_view_s3_r3","columns":"1:2"},{"id":"station_proposals_view_s3_r4","columns":"1:2"},{"id":"station_proposals_view_s3_r5","columns":"1:2"},{"id":"station_proposals_view_s3_r6","columns":"1:1"}]},{"id":"station_proposals_view_s4","title":"Chi phí đầu tư TDT","collapsible":false,"visibleWhen":{"field":"mo_hinh_dau_tu","value":"TDT"},"rows":[{"id":"station_proposals_view_s4_r1","columns":"1:1"},{"id":"station_proposals_view_s4_r2","columns":"1:1"},{"id":"station_proposals_view_s4_r3","columns":"1:1"}]},{"id":"station_proposals_view_s5","title":"Thông tin CĐT Liên kết","collapsible":false,"visibleWhen":{"field":"mo_hinh_dau_tu","value":"LK"},"rows":[{"id":"station_proposals_view_s5_r1","columns":"1:2"},{"id":"station_proposals_view_s5_r2","columns":"1:2"},{"id":"station_proposals_view_s5_r3","columns":"1:2"},{"id":"station_proposals_view_s5_r4","columns":"1:2"},{"id":"station_proposals_view_s5_r5","columns":"1:1"}]},{"id":"station_proposals_view_s6","title":"Thông tin Nhượng quyền","collapsible":false,"visibleWhen":{"field":"mo_hinh_dau_tu","value":"NQ"},"rows":[{"id":"station_proposals_view_s6_r1","columns":"1:2"},{"id":"station_proposals_view_s6_r2","columns":"1:2"},{"id":"station_proposals_view_s6_r3","columns":"1:2"},{"id":"station_proposals_view_s6_r4","columns":"1:2"},{"id":"station_proposals_view_s6_r5","columns":"1:2"},{"id":"station_proposals_view_s6_r6","columns":"1:2"}]},{"id":"station_proposals_view_s7","title":"Hồ sơ & Hình ảnh","collapsible":false,"rows":[{"id":"station_proposals_view_s7_r1","columns":"1:2"},{"id":"station_proposals_view_s7_r2","columns":"1:2"}]},{"id":"station_proposals_view_s8","title":"Thông tin hệ thống","collapsible":false,"rows":[{"id":"station_proposals_view_s8_r1","columns":"1:2"},{"id":"station_proposals_view_s8_r2","columns":"1:2"}]}]}', updated_at = NOW() WHERE entity='station_proposals' AND purpose='view';

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT t.form_id, t.field_id, t.order_index, t.visible, t.config FROM (
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='owner_name' LIMIT 1) AS field_id, 0 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s1_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='owner_phone' LIMIT 1) AS field_id, 1 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s1_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='latitude' LIMIT 1) AS field_id, 2 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s2_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='longitude' LIMIT 1) AS field_id, 3 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s2_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='address' LIMIT 1) AS field_id, 4 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s2_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='province' LIMIT 1) AS field_id, 5 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s2_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='xa_phuong' LIMIT 1) AS field_id, 6 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s2_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='area' LIMIT 1) AS field_id, 7 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s2_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='dien_tich_mat_bang' LIMIT 1) AS field_id, 8 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s2_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='vung_mien' LIMIT 1) AS field_id, 9 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s2_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='land_type' LIMIT 1) AS field_id, 10 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s2_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='description' LIMIT 1) AS field_id, 11 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s3_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='ghi_chu' LIMIT 1) AS field_id, 12 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s3_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='investment_cost' LIMIT 1) AS field_id, 13 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s3_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='loai_tru' LIMIT 1) AS field_id, 14 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s3_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='mo_hinh_dau_tu' LIMIT 1) AS field_id, 15 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s3_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='ma_tinh' LIMIT 1) AS field_id, 16 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s3_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nguon_dien' LIMIT 1) AS field_id, 17 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s3_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='thoi_gian_lap_dat' LIMIT 1) AS field_id, 18 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s3_r5","colSpan":1,"colIndex":1,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='thoi_gian_nghiem_thu' LIMIT 1) AS field_id, 19 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s3_r6","colSpan":1,"colIndex":0,"rowIndex":5}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='tdt_tru' LIMIT 1) AS field_id, 20 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s4_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='tdt_chi_phi_khac' LIMIT 1) AS field_id, 21 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s4_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='tdt_tong_cong' LIMIT 1) AS field_id, 22 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s4_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_ten_phap_nhan' LIMIT 1) AS field_id, 23 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s5_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_mst' LIMIT 1) AS field_id, 24 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s5_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_nguoi_dai_dien' LIMIT 1) AS field_id, 25 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s5_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_sdt' LIMIT 1) AS field_id, 26 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s5_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_dia_chi_dkkd' LIMIT 1) AS field_id, 27 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s5_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_ty_le_tmt' LIMIT 1) AS field_id, 28 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s5_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_ty_le_doi_tac' LIMIT 1) AS field_id, 29 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s5_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_chia_loi_nhuan_tmt' LIMIT 1) AS field_id, 30 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s5_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='lk_chia_loi_nhuan_lk' LIMIT 1) AS field_id, 31 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s5_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_gia_niem_yet' LIMIT 1) AS field_id, 32 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_gia_uu_dai' LIMIT 1) AS field_id, 33 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_ten_khach_hang' LIMIT 1) AS field_id, 34 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_mst' LIMIT 1) AS field_id, 35 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_nguoi_dai_dien' LIMIT 1) AS field_id, 36 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_sdt' LIMIT 1) AS field_id, 37 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_so_tai_khoan' LIMIT 1) AS field_id, 38 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_chia_loi_nhuan_tmt' LIMIT 1) AS field_id, 39 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_chia_loi_nhuan_nq' LIMIT 1) AS field_id, 40 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_thanh_toan_lan_1' LIMIT 1) AS field_id, 41 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r5","colSpan":1,"colIndex":1,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_thanh_toan_lan_2' LIMIT 1) AS field_id, 42 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r6","colSpan":1,"colIndex":0,"rowIndex":5}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nq_thanh_toan_lan_3' LIMIT 1) AS field_id, 43 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s6_r6","colSpan":1,"colIndex":1,"rowIndex":5}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='legal_document' LIMIT 1) AS field_id, 44 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s7_r1","colSpan":1,"colIndex":0,"rowIndex":0,"conditions":[{"field":"mo_hinh_dau_tu","operator":"=","value":"TDT"},{"field":"mo_hinh_dau_tu","operator":"=","value":"LK"}],"conditionLogic":"OR"}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='site_images' LIMIT 1) AS field_id, 45 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s7_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='phap_ly_dat' LIMIT 1) AS field_id, 46 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s7_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='dkkd_cccd_hkd' LIMIT 1) AS field_id, 47 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s7_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='status' LIMIT 1) AS field_id, 48 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s8_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='ma_de_xuat' LIMIT 1) AS field_id, 49 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s8_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nguoi_de_xuat' LIMIT 1) AS field_id, 50 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s8_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='station_proposals' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='sales_quan_ly' LIMIT 1) AS field_id, 51 AS order_index, 1 AS visible, '{"rowId":"station_proposals_view_s8_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
) t WHERE t.form_id IS NOT NULL AND t.field_id IS NOT NULL;

-- ============ FORM: stations / create ============
INSERT INTO forms (entity, name, description, status, purpose)
SELECT 'stations', 'Form stations - Nhập liệu', 'Form nhập liệu trạm sạc', 'active', 'create'
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity='stations' AND purpose='create');

DELETE FROM form_fields WHERE form_id = (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1);
UPDATE forms SET layout_config = '{"rows":[],"sections":[{"id":"stations_create_s1","title":"Thông tin trạm","collapsible":false,"rows":[{"id":"stations_create_s1_r1","columns":"1:2"},{"id":"stations_create_s1_r2","columns":"1:2"},{"id":"stations_create_s1_r3","columns":"1:2"},{"id":"stations_create_s1_r4","columns":"1:2"},{"id":"stations_create_s1_r5","columns":"1:1"}]},{"id":"stations_create_s2","title":"Vị trí","collapsible":false,"rows":[{"id":"stations_create_s2_r1","columns":"1:2"},{"id":"stations_create_s2_r2","columns":"1:2"}]},{"id":"stations_create_s3","title":"Thông số kỹ thuật","collapsible":false,"rows":[{"id":"stations_create_s3_r1","columns":"1:2"},{"id":"stations_create_s3_r2","columns":"1:1"}]},{"id":"stations_create_s4","title":"Thống kê","collapsible":false,"rows":[{"id":"stations_create_s4_r1","columns":"1:2"}]}]}', updated_at = NOW() WHERE entity='stations' AND purpose='create';

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT t.form_id, t.field_id, t.order_index, t.visible, t.config FROM (
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='ma_tram' LIMIT 1) AS field_id, 0 AS order_index, 1 AS visible, '{"rowId":"stations_create_s1_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='name' LIMIT 1) AS field_id, 1 AS order_index, 1 AS visible, '{"rowId":"stations_create_s1_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='status' LIMIT 1) AS field_id, 2 AS order_index, 1 AS visible, '{"rowId":"stations_create_s1_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='nha_dieu_hanh' LIMIT 1) AS field_id, 3 AS order_index, 1 AS visible, '{"rowId":"stations_create_s1_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='doi_tuong_quan_ly' LIMIT 1) AS field_id, 4 AS order_index, 1 AS visible, '{"rowId":"stations_create_s1_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='nha_dau_tu' LIMIT 1) AS field_id, 5 AS order_index, 1 AS visible, '{"rowId":"stations_create_s1_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='loai_phuong_tien' LIMIT 1) AS field_id, 6 AS order_index, 1 AS visible, '{"rowId":"stations_create_s1_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='loai_tru_sac' LIMIT 1) AS field_id, 7 AS order_index, 1 AS visible, '{"rowId":"stations_create_s1_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='description' LIMIT 1) AS field_id, 8 AS order_index, 1 AS visible, '{"rowId":"stations_create_s1_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='latitude' LIMIT 1) AS field_id, 9 AS order_index, 1 AS visible, '{"rowId":"stations_create_s2_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='longitude' LIMIT 1) AS field_id, 10 AS order_index, 1 AS visible, '{"rowId":"stations_create_s2_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='province' LIMIT 1) AS field_id, 11 AS order_index, 1 AS visible, '{"rowId":"stations_create_s2_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='address' LIMIT 1) AS field_id, 12 AS order_index, 1 AS visible, '{"rowId":"stations_create_s2_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='tower_type' LIMIT 1) AS field_id, 13 AS order_index, 1 AS visible, '{"rowId":"stations_create_s3_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='power_capacity' LIMIT 1) AS field_id, 14 AS order_index, 1 AS visible, '{"rowId":"stations_create_s3_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='so_luong_tru' LIMIT 1) AS field_id, 15 AS order_index, 1 AS visible, '{"rowId":"stations_create_s3_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='tong_so_phien_sac' LIMIT 1) AS field_id, 16 AS order_index, 1 AS visible, '{"rowId":"stations_create_s4_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='so_dien_ban_duoc' LIMIT 1) AS field_id, 17 AS order_index, 1 AS visible, '{"rowId":"stations_create_s4_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
) t WHERE t.form_id IS NOT NULL AND t.field_id IS NOT NULL;

-- ============ FORM: stations / view ============
INSERT INTO forms (entity, name, description, status, purpose)
SELECT 'stations', 'Form stations - Xem / sửa', 'Form xem/sửa trạm sạc', 'active', 'view'
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity='stations' AND purpose='view');

DELETE FROM form_fields WHERE form_id = (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1);
UPDATE forms SET layout_config = '{"rows":[],"sections":[{"id":"stations_view_s1","title":"Thông tin trạm","collapsible":false,"rows":[{"id":"stations_view_s1_r1","columns":"1:2"},{"id":"stations_view_s1_r2","columns":"1:2"},{"id":"stations_view_s1_r3","columns":"1:2"},{"id":"stations_view_s1_r4","columns":"1:2"},{"id":"stations_view_s1_r5","columns":"1:1"}]},{"id":"stations_view_s2","title":"Vị trí","collapsible":false,"rows":[{"id":"stations_view_s2_r1","columns":"1:2"},{"id":"stations_view_s2_r2","columns":"1:2"}]},{"id":"stations_view_s3","title":"Thông số kỹ thuật","collapsible":false,"rows":[{"id":"stations_view_s3_r1","columns":"1:2"},{"id":"stations_view_s3_r2","columns":"1:1"}]},{"id":"stations_view_s4","title":"Thống kê","collapsible":false,"rows":[{"id":"stations_view_s4_r1","columns":"1:2"}]}]}', updated_at = NOW() WHERE entity='stations' AND purpose='view';

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT t.form_id, t.field_id, t.order_index, t.visible, t.config FROM (
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='ma_tram' LIMIT 1) AS field_id, 0 AS order_index, 1 AS visible, '{"rowId":"stations_view_s1_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='name' LIMIT 1) AS field_id, 1 AS order_index, 1 AS visible, '{"rowId":"stations_view_s1_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='status' LIMIT 1) AS field_id, 2 AS order_index, 1 AS visible, '{"rowId":"stations_view_s1_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='nha_dieu_hanh' LIMIT 1) AS field_id, 3 AS order_index, 1 AS visible, '{"rowId":"stations_view_s1_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='doi_tuong_quan_ly' LIMIT 1) AS field_id, 4 AS order_index, 1 AS visible, '{"rowId":"stations_view_s1_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='nha_dau_tu' LIMIT 1) AS field_id, 5 AS order_index, 1 AS visible, '{"rowId":"stations_view_s1_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='loai_phuong_tien' LIMIT 1) AS field_id, 6 AS order_index, 1 AS visible, '{"rowId":"stations_view_s1_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='loai_tru_sac' LIMIT 1) AS field_id, 7 AS order_index, 1 AS visible, '{"rowId":"stations_view_s1_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='description' LIMIT 1) AS field_id, 8 AS order_index, 1 AS visible, '{"rowId":"stations_view_s1_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='latitude' LIMIT 1) AS field_id, 9 AS order_index, 1 AS visible, '{"rowId":"stations_view_s2_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='longitude' LIMIT 1) AS field_id, 10 AS order_index, 1 AS visible, '{"rowId":"stations_view_s2_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='province' LIMIT 1) AS field_id, 11 AS order_index, 1 AS visible, '{"rowId":"stations_view_s2_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='address' LIMIT 1) AS field_id, 12 AS order_index, 1 AS visible, '{"rowId":"stations_view_s2_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='tower_type' LIMIT 1) AS field_id, 13 AS order_index, 1 AS visible, '{"rowId":"stations_view_s3_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='power_capacity' LIMIT 1) AS field_id, 14 AS order_index, 1 AS visible, '{"rowId":"stations_view_s3_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='so_luong_tru' LIMIT 1) AS field_id, 15 AS order_index, 1 AS visible, '{"rowId":"stations_view_s3_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='tong_so_phien_sac' LIMIT 1) AS field_id, 16 AS order_index, 1 AS visible, '{"rowId":"stations_view_s4_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='stations' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='so_dien_ban_duoc' LIMIT 1) AS field_id, 17 AS order_index, 1 AS visible, '{"rowId":"stations_view_s4_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
) t WHERE t.form_id IS NOT NULL AND t.field_id IS NOT NULL;

-- ============ FORM: users / create ============
INSERT INTO forms (entity, name, description, status, purpose)
SELECT 'users', 'Form Users - Nhập liệu', 'Form nhập liệu người dùng', 'active', 'create'
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity='users' AND purpose='create');

DELETE FROM form_fields WHERE form_id = (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1);
UPDATE forms SET layout_config = '{"rows":[],"sections":[{"id":"users_create_s1","title":"Thông tin tài khoản","collapsible":false,"rows":[{"id":"users_create_s1_r1","columns":"1:2"},{"id":"users_create_s1_r2","columns":"1:2"},{"id":"users_create_s1_r3","columns":"1:2"},{"id":"users_create_s1_r4","columns":"1:2"},{"id":"users_create_s1_r5","columns":"1:2"},{"id":"users_create_s1_r6","columns":"1:1"}]}]}', updated_at = NOW() WHERE entity='users' AND purpose='create';

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT t.form_id, t.field_id, t.order_index, t.visible, t.config FROM (
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='employee_code' LIMIT 1) AS field_id, 0 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='full_name' LIMIT 1) AS field_id, 1 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='email' LIMIT 1) AS field_id, 2 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='phone' LIMIT 1) AS field_id, 3 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='password' LIMIT 1) AS field_id, 4 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='external_id' LIMIT 1) AS field_id, 5 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='role' LIMIT 1) AS field_id, 6 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='status' LIMIT 1) AS field_id, 7 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='department' LIMIT 1) AS field_id, 8 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='chuc_vu' LIMIT 1) AS field_id, 9 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r5","colSpan":1,"colIndex":1,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='create' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='avatar' LIMIT 1) AS field_id, 10 AS order_index, 1 AS visible, '{"rowId":"users_create_s1_r6","colSpan":1,"colIndex":0,"rowIndex":5}' AS config
) t WHERE t.form_id IS NOT NULL AND t.field_id IS NOT NULL;

-- ============ FORM: users / view ============
INSERT INTO forms (entity, name, description, status, purpose)
SELECT 'users', 'Form Users - Xem/sửa', 'Form xem/sửa người dùng', 'active', 'view'
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity='users' AND purpose='view');

DELETE FROM form_fields WHERE form_id = (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1);
UPDATE forms SET layout_config = '{"rows":[],"sections":[{"id":"users_view_s1","title":"Thông tin tài khoản","collapsible":false,"rows":[{"id":"users_view_s1_r1","columns":"1:2"},{"id":"users_view_s1_r2","columns":"1:2"},{"id":"users_view_s1_r3","columns":"1:2"},{"id":"users_view_s1_r4","columns":"1:2"},{"id":"users_view_s1_r5","columns":"1:2"},{"id":"users_view_s1_r6","columns":"1:1"}]}]}', updated_at = NOW() WHERE entity='users' AND purpose='view';

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT t.form_id, t.field_id, t.order_index, t.visible, t.config FROM (
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='employee_code' LIMIT 1) AS field_id, 0 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r1","colSpan":1,"colIndex":0,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='full_name' LIMIT 1) AS field_id, 1 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r1","colSpan":1,"colIndex":1,"rowIndex":0}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='email' LIMIT 1) AS field_id, 2 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r2","colSpan":1,"colIndex":0,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='phone' LIMIT 1) AS field_id, 3 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r2","colSpan":1,"colIndex":1,"rowIndex":1}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='password' LIMIT 1) AS field_id, 4 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r3","colSpan":1,"colIndex":0,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='external_id' LIMIT 1) AS field_id, 5 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r3","colSpan":1,"colIndex":1,"rowIndex":2}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='role' LIMIT 1) AS field_id, 6 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r4","colSpan":1,"colIndex":0,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='status' LIMIT 1) AS field_id, 7 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r4","colSpan":1,"colIndex":1,"rowIndex":3}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='department' LIMIT 1) AS field_id, 8 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r5","colSpan":1,"colIndex":0,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='chuc_vu' LIMIT 1) AS field_id, 9 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r5","colSpan":1,"colIndex":1,"rowIndex":4}' AS config
UNION ALL
SELECT (SELECT id FROM forms WHERE entity='users' AND purpose='view' LIMIT 1) AS form_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='avatar' LIMIT 1) AS field_id, 10 AS order_index, 1 AS visible, '{"rowId":"users_view_s1_r6","colSpan":1,"colIndex":0,"rowIndex":5}' AS config
) t WHERE t.form_id IS NOT NULL AND t.field_id IS NOT NULL;

-- ============ VIEW: station_proposals ============
INSERT INTO views (entity, name, description, status)
SELECT 'station_proposals', 'View Proposals', 'View chuẩn hóa cho station_proposals', 'active'
WHERE NOT EXISTS (SELECT 1 FROM views WHERE entity='station_proposals');
DELETE FROM view_fields WHERE view_id = (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT t.view_id, t.field_id, t.order_index, t.visible, t.width, t.sortable, t.filterable, t.config FROM (
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='ma_de_xuat' LIMIT 1) AS field_id, 0 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='owner_name' LIMIT 1) AS field_id, 1 AS order_index, 1 AS visible, 150 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='owner_phone' LIMIT 1) AS field_id, 2 AS order_index, 1 AS visible, 120 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='mo_hinh_dau_tu' LIMIT 1) AS field_id, 3 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='address' LIMIT 1) AS field_id, 4 AS order_index, 1 AS visible, 250 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='province' LIMIT 1) AS field_id, 5 AS order_index, 1 AS visible, 120 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='status' LIMIT 1) AS field_id, 6 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='latitude' LIMIT 1) AS field_id, 7 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='longitude' LIMIT 1) AS field_id, 8 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='investment_cost' LIMIT 1) AS field_id, 9 AS order_index, 1 AS visible, 110 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nguon_dien' LIMIT 1) AS field_id, 10 AS order_index, 1 AS visible, 110 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='dien_tich_mat_bang' LIMIT 1) AS field_id, 11 AS order_index, 1 AS visible, 110 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nguoi_de_xuat' LIMIT 1) AS field_id, 12 AS order_index, 1 AS visible, 150 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='id_1office' LIMIT 1) AS field_id, 13 AS order_index, 0 AS visible, 120 AS width, 0 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='he_thong_nguon' LIMIT 1) AS field_id, 14 AS order_index, 0 AS visible, 110 AS width, 0 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nhom_nguoi_tao' LIMIT 1) AS field_id, 15 AS order_index, 0 AS visible, 110 AS width, 0 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='sales_quan_ly' LIMIT 1) AS field_id, 16 AS order_index, 0 AS visible, 130 AS width, 0 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nguoi_phu_trach' LIMIT 1) AS field_id, 17 AS order_index, 0 AS visible, 130 AS width, 0 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='station_proposals' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='station_proposals' AND `key`='nguoi_giao_phu_trach' LIMIT 1) AS field_id, 18 AS order_index, 0 AS visible, 140 AS width, 0 AS sortable, 1 AS filterable, NULL AS config
) t WHERE t.view_id IS NOT NULL AND t.field_id IS NOT NULL;

-- ============ VIEW: stations ============
INSERT INTO views (entity, name, description, status)
SELECT 'stations', 'View Stations', 'View chuẩn hóa cho stations', 'active'
WHERE NOT EXISTS (SELECT 1 FROM views WHERE entity='stations');
DELETE FROM view_fields WHERE view_id = (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT t.view_id, t.field_id, t.order_index, t.visible, t.width, t.sortable, t.filterable, t.config FROM (
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='ma_tram' LIMIT 1) AS field_id, 0 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='name' LIMIT 1) AS field_id, 1 AS order_index, 1 AS visible, 200 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='status' LIMIT 1) AS field_id, 2 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='nha_dieu_hanh' LIMIT 1) AS field_id, 3 AS order_index, 1 AS visible, 120 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='doi_tuong_quan_ly' LIMIT 1) AS field_id, 4 AS order_index, 1 AS visible, 120 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='nha_dau_tu' LIMIT 1) AS field_id, 5 AS order_index, 1 AS visible, 140 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='loai_phuong_tien' LIMIT 1) AS field_id, 6 AS order_index, 1 AS visible, 110 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='loai_tru_sac' LIMIT 1) AS field_id, 7 AS order_index, 1 AS visible, 110 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='so_luong_tru' LIMIT 1) AS field_id, 8 AS order_index, 1 AS visible, 90 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='address' LIMIT 1) AS field_id, 9 AS order_index, 1 AS visible, 250 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='province' LIMIT 1) AS field_id, 10 AS order_index, 1 AS visible, 120 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='latitude' LIMIT 1) AS field_id, 11 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='longitude' LIMIT 1) AS field_id, 12 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='tower_type' LIMIT 1) AS field_id, 13 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='power_capacity' LIMIT 1) AS field_id, 14 AS order_index, 1 AS visible, 90 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='tong_so_phien_sac' LIMIT 1) AS field_id, 15 AS order_index, 1 AS visible, 110 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='stations' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='stations' AND `key`='so_dien_ban_duoc' LIMIT 1) AS field_id, 16 AS order_index, 1 AS visible, 120 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
) t WHERE t.view_id IS NOT NULL AND t.field_id IS NOT NULL;

-- ============ VIEW: users ============
INSERT INTO views (entity, name, description, status)
SELECT 'users', 'View Users', 'View chuẩn hóa cho users', 'active'
WHERE NOT EXISTS (SELECT 1 FROM views WHERE entity='users');
DELETE FROM view_fields WHERE view_id = (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT t.view_id, t.field_id, t.order_index, t.visible, t.width, t.sortable, t.filterable, t.config FROM (
SELECT (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='full_name' LIMIT 1) AS field_id, 0 AS order_index, 1 AS visible, 180 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='email' LIMIT 1) AS field_id, 1 AS order_index, 1 AS visible, 200 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='phone' LIMIT 1) AS field_id, 2 AS order_index, 1 AS visible, 120 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='role' LIMIT 1) AS field_id, 3 AS order_index, 1 AS visible, 110 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='status' LIMIT 1) AS field_id, 4 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='department' LIMIT 1) AS field_id, 5 AS order_index, 1 AS visible, 120 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='chuc_vu' LIMIT 1) AS field_id, 6 AS order_index, 1 AS visible, 120 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='employee_code' LIMIT 1) AS field_id, 7 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
UNION ALL
SELECT (SELECT id FROM views WHERE entity='users' ORDER BY id LIMIT 1) AS view_id, (SELECT id FROM field_definitions WHERE entity='users' AND `key`='external_id' LIMIT 1) AS field_id, 8 AS order_index, 1 AS visible, 100 AS width, 1 AS sortable, 1 AS filterable, NULL AS config
) t WHERE t.view_id IS NOT NULL AND t.field_id IS NOT NULL;
