-- -*- coding: utf-8 -*-
-- 59: Chuẩn hóa fields 3 entity — Phần 1: schema is_locked + xóa field rác + dọn DataList
-- Bước 1 của docs/5/38.ChuanHoaFields3Entity_kehoach.md

-- ============================================================
-- 1. Thêm cột is_locked (khóa field)
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'field_definitions'
    AND COLUMN_NAME = 'is_locked'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE field_definitions ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 2. Xóa field rác (form_fields/view_fields tự cascade theo FK)
-- ============================================================
DELETE FROM field_definitions
 WHERE (entity = 'station_proposals' AND `key` = 'giacatest')
    OR (entity = 'stations'          AND `key` = 'testtable');

-- ============================================================
-- 3. DataList dm_loai_tru (dùng tạm, thay giá trị thật sau)
-- ============================================================
INSERT IGNORE INTO data_lists (name, description, columns_config)
VALUES ('dm_loai_tru', 'Loại trụ sạc (tạm)',
        '[{"key":"ma","label":"Mã","type":"text"},{"key":"ten","label":"Tên","type":"text"}]');

SET @dl_loai_tru := (SELECT id FROM data_lists WHERE name = 'dm_loai_tru');

DELETE FROM data_list_rows WHERE list_id = @dl_loai_tru;
INSERT INTO data_list_rows (list_id, data, sort_order) VALUES
  (@dl_loai_tru, '{"ma":"CCS2_60","ten":"CCS2 60kW"}', 1),
  (@dl_loai_tru, '{"ma":"CCS2_120","ten":"CCS2 120kW"}', 2),
  (@dl_loai_tru, '{"ma":"CCS2_240","ten":"CCS2 240kW"}', 3);

-- 3.1. Proposal: loai_tru -> dm_loai_tru (bỏ manual options / list rác)
UPDATE field_definitions
   SET data_list_id = @dl_loai_tru,
       data_list_column = 'ten',
       data_list_label_column = NULL,
       options = NULL,
       updated_at = NOW()
 WHERE entity = 'station_proposals' AND `key` = 'loai_tru';

-- 3.2. Station: tower_type gỡ khỏi list rác (giữ manual options Cột đơn/đôi/ba)
UPDATE field_definitions
   SET data_list_id = NULL,
       data_list_column = NULL,
       data_list_label_column = NULL,
       updated_at = NOW()
 WHERE entity = 'stations' AND `key` = 'tower_type';

-- ============================================================
-- 4. Xóa DataList rác "Giả cả" nếu không còn field tham chiếu
-- ============================================================
SET @gia_ca_id := (SELECT id FROM data_lists WHERE name = 'Giả cả');
SET @gia_ca_refs := (SELECT COUNT(*) FROM field_definitions WHERE data_list_id = @gia_ca_id);

SET @del_dl := IF(@gia_ca_id IS NOT NULL AND @gia_ca_refs = 0,
  CONCAT('DELETE FROM data_lists WHERE id = ', @gia_ca_id),
  'SELECT 1');
PREPARE stmt2 FROM @del_dl;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
