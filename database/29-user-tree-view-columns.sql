-- 29: Cot ma ngoai + mau role cho View Users (file 25, Phase 2 - fix table dung view)
-- Quy ước dự án: SQL thủ công, không DROP TABLE, chạy lần lượt bằng tay.

-- Field external_id liên kết cột gốc users.external_id (source fixed)
INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, status)
VALUES ('users', 'external_id', 'Mã ngoài', 'text', 'fixed', 0, 'active');

-- Thêm vào View Users (view_id = 7), cuối bảng
SET @ext_field = LAST_INSERT_ID();
SET @max_ord = (SELECT COALESCE(MAX(order_index), -1) + 1 FROM view_fields WHERE view_id = 7);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
VALUES (7, @ext_field, @max_ord, 1, NULL, 0, 0, NULL);

-- Màu badge theo role (FieldRenderer dùng color/borderRadius của option)
UPDATE field_definitions SET options = '[{"label": "SUPER_ADMIN", "value": "SUPER_ADMIN", "color": "#dc2626", "borderRadius": "rounded"}, {"label": "ADMIN", "value": "ADMIN", "color": "#7c3aed", "borderRadius": "rounded"}, {"label": "SALES", "value": "SALES", "color": "#2563eb", "borderRadius": "rounded"}, {"label": "CTV", "value": "CTV", "color": "#666666", "borderRadius": "rounded"}]', updated_at = NOW() WHERE id = 44;
