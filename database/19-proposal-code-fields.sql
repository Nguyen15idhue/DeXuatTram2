-- 19-proposal-code-fields.sql
-- Yeu cau 1 (21.Checkloctrung_kehoach.md - Buoc 1.2): truong ma de xuat + sequence per-prefix
-- 1. Chuyen options mo_hinh_dau_tu (id 101) sang ma ngan NQ/TDT/LK (chua co record nao dung gia tri cu)
-- 2. Them field ma_tinh (select tu dm_tinh) + ma_de_xuat (formula post)
-- 3. Bang proposal_sequences dem rieng tung prefix
-- 4. Gan 3 fields vao form 9 + view 8

CREATE TABLE IF NOT EXISTS proposal_sequences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    prefix VARCHAR(20) NOT NULL,
    last_number INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_prefix (prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE field_definitions
SET options = '[{"label": "Nhượng quyền", "value": "NQ", "color": "#166534", "borderRadius": "rounded"}, {"label": "Tự đầu tư", "value": "TDT", "color": "#eab308", "borderRadius": "rounded"}, {"label": "Liên kết", "value": "LK", "color": "#3b82f6", "borderRadius": "rounded"}]',
    required = 1
WHERE id = 101;

SET @dm_tinh_id = (SELECT id FROM data_lists WHERE name = 'dm_tinh');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, data_list_id, data_list_column, status)
VALUES ('station_proposals', 'ma_tinh', 'Mã tỉnh', 'select', 'json', 1, @dm_tinh_id, 'ma_tinh', 'active');

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, formula_config, status)
VALUES ('station_proposals', 'ma_de_xuat', 'Mã đề xuất', 'formula', 'json', 0,
 '{"compute_mode": "post", "expression": "CONCAT(mo_hinh_dau_tu, ''_'', ma_tinh, ''_'', SEQ(CONCAT(mo_hinh_dau_tu, ''_'', ma_tinh)))", "referencedFields": ["mo_hinh_dau_tu", "ma_tinh"], "outputType": "text"}',
 'active');

SET @ma_tinh_fid = (SELECT id FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'ma_tinh');
SET @ma_de_xuat_fid = (SELECT id FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'ma_de_xuat');

INSERT INTO form_fields (form_id, field_id, order_index, visible) VALUES
(9, 101, 12, 1),
(9, @ma_tinh_fid, 13, 1),
(9, @ma_de_xuat_fid, 14, 1);

INSERT INTO view_fields (view_id, field_id, order_index, visible, sortable, filterable) VALUES
(8, @ma_de_xuat_fid, 11, 1, 1, 1),
(8, 101, 12, 1, 1, 1),
(8, @ma_tinh_fid, 13, 1, 1, 1);
