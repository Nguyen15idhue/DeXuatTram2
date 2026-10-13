-- 86: Quy chuan luong trang thai de xuat (docs/8/46)
-- 1. Mo rong enum station_proposals.status: 4 -> 7 (them CANCELLED, CONTRACT_SIGNED, CONTRACT_FAILED)
-- 2. Options status proposals: 7 muc (giu nguyen mau/label 4 muc cu, them icon + show_in_legend + sort_order)
-- 3. Them station_proposals.station_id FK -> stations.id (dau hieu de xuat da thanh tram)
-- 4. Field stations.vung_mien + stations.xa_phuong (de tram tao tu dong co cho luu vung mien) + gan form 10/12 + view 6
-- 5. Them option NQ_LK vao stations.mo_hinh_tram (map 1:1 voi mo_hinh_dau_tu)
-- Idempotent. Snapshot 17/09: proposals PENDING 19 / APPROVED 3 / REJECTED 3.

-- ============ 1. ENUM 7 gia tri (guard information_schema) ============
SET @has_cancelled := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'status'
    AND COLUMN_TYPE LIKE '%CANCELLED%'
);
SET @sql_enum := IF(@has_cancelled = 0,
  'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(''PENDING'',''REVIEWING'',''APPROVED'',''REJECTED'',''CANCELLED'',''CONTRACT_SIGNED'',''CONTRACT_FAILED'') NULL DEFAULT ''PENDING''',
  'SELECT ''enum station_proposals.status already has CANCELLED'' AS info');
PREPARE stmt_enum FROM @sql_enum;
EXECUTE stmt_enum;
DEALLOCATE PREPARE stmt_enum;

-- ============ 2. Options status proposals (7 muc) ============
-- Icon phai thuoc catalog 42 icon (mapMarkerIcons.js): CONTRACT_SIGNED=document, CONTRACT_FAILED=alert
UPDATE field_definitions
SET options = '[{"value":"PENDING","label":"Đang đề xuất","color":"#facc15","borderRadius":"rounded","icon":"clock","show_in_legend":1,"sort_order":1},{"value":"REVIEWING","label":"Đang xem xét","color":"#3b82f6","borderRadius":"rounded","icon":"search","show_in_legend":1,"sort_order":2},{"value":"APPROVED","label":"Đã duyệt BCĐX","color":"#16a34a","borderRadius":"rounded","icon":"check","show_in_legend":1,"sort_order":3},{"value":"CANCELLED","label":"Đã hủy","color":"#6b7280","borderRadius":"rounded","icon":"ban","show_in_legend":1,"sort_order":4},{"value":"REJECTED","label":"Từ chối","color":"#dc2626","borderRadius":"rounded","icon":"cross","show_in_legend":0,"sort_order":5},{"value":"CONTRACT_SIGNED","label":"Ký thành công","color":"#0d9488","borderRadius":"rounded","icon":"document","show_in_legend":0,"sort_order":6},{"value":"CONTRACT_FAILED","label":"Ký thất bại","color":"#f59e0b","borderRadius":"rounded","icon":"alert","show_in_legend":0,"sort_order":7}]'
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value','CONTRACT_SIGNED','icon','document'), '$');

-- ============ 3. station_id FK -> stations.id ============
SET @has_station_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'station_id'
);
SET @sql_col := IF(@has_station_id = 0,
  'ALTER TABLE station_proposals ADD COLUMN station_id INT NULL AFTER sync_status',
  'SELECT ''station_proposals.station_id already exists'' AS info');
PREPARE stmt_col FROM @sql_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;

SET @has_fk := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals'
    AND COLUMN_NAME = 'station_id' AND REFERENCED_TABLE_NAME = 'stations'
);
SET @sql_fk := IF(@has_fk = 0,
  'ALTER TABLE station_proposals ADD CONSTRAINT fk_proposals_station FOREIGN KEY (station_id) REFERENCES stations (id) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT ''fk_proposals_station already exists'' AS info');
PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

-- ============ 4. Field stations.vung_mien + stations.xa_phuong ============
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, status)
SELECT 'stations', 'vung_mien', 'Vùng miền', 'select', 'json', 0, dl.id, 'vung_mien', 'active'
FROM data_lists dl WHERE dl.name = 'dm_tinh'
  AND NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'stations' AND `key` = 'vung_mien');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, status)
SELECT 'stations', 'xa_phuong', 'Xã phường', 'select', 'json', 0, dl.id, 'xa', 'active'
FROM data_lists dl WHERE dl.name = 'Danh muc Phuong Xa'
  AND NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'stations' AND `key` = 'xa_phuong');

-- Gan vao form create (12): section s2 them row r3 (1:2)
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[1].rows', JSON_OBJECT('id','stations_create_s2_r3','columns','1:2'))
WHERE id = 12 AND JSON_SEARCH(layout_config, 'one', 'stations_create_s2_r3') IS NULL;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 12, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 12), 0) + 1, 1,
  '{"rowId":"stations_create_s2_r3","colSpan":1,"colIndex":0,"rowIndex":2}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'vung_mien'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 12 AND ff.field_id = fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 12, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 12), 0) + 1, 1,
  '{"rowId":"stations_create_s2_r3","colSpan":1,"colIndex":1,"rowIndex":2}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'xa_phuong'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 12 AND ff.field_id = fd.id);

-- Gan vao form view (10): section s2 them row r3 (1:2)
UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(layout_config, '$.sections[1].rows', JSON_OBJECT('id','stations_view_s2_r3','columns','1:2'))
WHERE id = 10 AND JSON_SEARCH(layout_config, 'one', 'stations_view_s2_r3') IS NULL;

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 10, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 10), 0) + 1, 1,
  '{"rowId":"stations_view_s2_r3","colSpan":1,"colIndex":0,"rowIndex":2}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'vung_mien'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 10 AND ff.field_id = fd.id);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 10, fd.id, COALESCE((SELECT MAX(order_index) FROM form_fields WHERE form_id = 10), 0) + 1, 1,
  '{"rowId":"stations_view_s2_r3","colSpan":1,"colIndex":1,"rowIndex":2}'
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'xa_phuong'
  AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = 10 AND ff.field_id = fd.id);

-- Gan vao view danh sach tram (6)
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT 6, fd.id, COALESCE((SELECT MAX(order_index) FROM view_fields WHERE view_id = 6), 0) + 1, 1, 140, 0, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'vung_mien'
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = 6 AND vf.field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT 6, fd.id, COALESCE((SELECT MAX(order_index) FROM view_fields WHERE view_id = 6), 0) + 1, 1, 140, 0, 0, NULL
FROM field_definitions fd
WHERE fd.entity = 'stations' AND fd.`key` = 'xa_phuong'
  AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = 6 AND vf.field_id = fd.id);

-- ============ 5. Them option NQ_LK vao stations.mo_hinh_tram ============
UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$',
  JSON_OBJECT('value','NQ_LK','label','Nhượng quyền + Liên kết','color','#0ea5e9','borderRadius','rounded'))
WHERE entity = 'stations' AND `key` = 'mo_hinh_tram'
  AND JSON_SEARCH(options, 'one', 'NQ_LK') IS NULL;
