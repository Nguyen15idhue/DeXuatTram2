-- 141: Seed forms + view cho entity leads (3 section).
-- Ke hoach 68 (section 14) + buoc 3.3 file 69.
-- 2 form: Nhap lieu (purpose create, 9 field) + Xem/sua (purpose view, 20 field, 3 section).
-- 1 view usage table (13 cot theo AdminStationsPage pattern).
-- Form/view mac dinh khoa xoa (is_locked = 1) nhu 3 entity cu.
-- Idempotent. Khong sua form/view cua entity khac.

-- ============ Form Nhap lieu (create) ============
INSERT INTO forms (entity, name, description, status, layout_config, purpose, is_locked, is_default)
SELECT 'leads', 'Lead - Nhập liệu', 'Form tạo Lead mới (Marketing)', 'active',
'{"sections": [{"id": "leads_create_s1", "title": "Thông tin Marketing", "collapsible": false, "rows": [{"id": "leads_create_s1_r1", "columns": "1:2"}, {"id": "leads_create_s1_r2", "columns": "1:2"}, {"id": "leads_create_s1_r3", "columns": "1:2"}, {"id": "leads_create_s1_r4", "columns": "1:2"}, {"id": "leads_create_s1_r5", "columns": "1:1"}]}]}',
'create', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity = 'leads' AND purpose = 'create' AND name = 'Lead - Nhập liệu');
SET @lead_create_id = (SELECT id FROM forms WHERE entity = 'leads' AND purpose = 'create' AND name = 'Lead - Nhập liệu' LIMIT 1);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_create_id, fd.id, 0, 1, '{"rowId":"leads_create_s1_r1","colIndex":0,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'full_name'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_create_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_create_id, fd.id, 1, 1, '{"rowId":"leads_create_s1_r1","colIndex":1,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'phone'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_create_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_create_id, fd.id, 2, 1, '{"rowId":"leads_create_s1_r2","colIndex":0,"rowIndex":1,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'email'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_create_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_create_id, fd.id, 3, 1, '{"rowId":"leads_create_s1_r2","colIndex":1,"rowIndex":1,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'province'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_create_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_create_id, fd.id, 4, 1, '{"rowId":"leads_create_s1_r3","colIndex":0,"rowIndex":2,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'ward'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_create_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_create_id, fd.id, 5, 1, '{"rowId":"leads_create_s1_r3","colIndex":1,"rowIndex":2,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'customer_type'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_create_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_create_id, fd.id, 6, 1, '{"rowId":"leads_create_s1_r4","colIndex":0,"rowIndex":3,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'source'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_create_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_create_id, fd.id, 7, 1, '{"rowId":"leads_create_s1_r4","colIndex":1,"rowIndex":3,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'address'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_create_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_create_id, fd.id, 8, 1, '{"rowId":"leads_create_s1_r5","colIndex":0,"rowIndex":4,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'note'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_create_id AND ff.field_id = fd.id);

-- ============ Form Xem/sua (view, 3 section, 20 field) ============
INSERT INTO forms (entity, name, description, status, layout_config, purpose, is_locked, is_default)
SELECT 'leads', 'Lead - Xem / sửa', 'Form xem/sửa Lead (Marketing + CSKH + TVBH)', 'active',
'{"sections": [{"id": "leads_view_s1", "title": "Thông tin Marketing", "collapsible": false, "rows": [{"id": "leads_view_s1_r1", "columns": "1:2"}, {"id": "leads_view_s1_r2", "columns": "1:2"}, {"id": "leads_view_s1_r3", "columns": "1:2"}, {"id": "leads_view_s1_r4", "columns": "1:2"}, {"id": "leads_view_s1_r5", "columns": "1:2"}, {"id": "leads_view_s1_r6", "columns": "1:2"}]}, {"id": "leads_view_s2", "title": "Chăm sóc khách hàng (CSKH)", "collapsible": false, "rows": [{"id": "leads_view_s2_r1", "columns": "1:1"}, {"id": "leads_view_s2_r2", "columns": "1:2"}]}, {"id": "leads_view_s3", "title": "Tư vấn bán hàng (TVBH)", "collapsible": false, "rows": [{"id": "leads_view_s3_r1", "columns": "1:1"}, {"id": "leads_view_s3_r2", "columns": "1:2"}, {"id": "leads_view_s3_r3", "columns": "1:2"}]}]}',
'view', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE entity = 'leads' AND purpose = 'view' AND name = 'Lead - Xem / sửa');
SET @lead_view_id = (SELECT id FROM forms WHERE entity = 'leads' AND purpose = 'view' AND name = 'Lead - Xem / sửa' LIMIT 1);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 0, 1, '{"rowId":"leads_view_s1_r1","colIndex":0,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'full_name'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 1, 1, '{"rowId":"leads_view_s1_r1","colIndex":1,"rowIndex":0,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'phone'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 2, 1, '{"rowId":"leads_view_s1_r2","colIndex":0,"rowIndex":1,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'email'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 3, 1, '{"rowId":"leads_view_s1_r2","colIndex":1,"rowIndex":1,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'province'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 4, 1, '{"rowId":"leads_view_s1_r3","colIndex":0,"rowIndex":2,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'ward'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 5, 1, '{"rowId":"leads_view_s1_r3","colIndex":1,"rowIndex":2,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'address'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 6, 1, '{"rowId":"leads_view_s1_r4","colIndex":0,"rowIndex":3,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'customer_type'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 7, 1, '{"rowId":"leads_view_s1_r4","colIndex":1,"rowIndex":3,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'source'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 8, 1, '{"rowId":"leads_view_s1_r5","colIndex":0,"rowIndex":4,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'note'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 9, 1, '{"rowId":"leads_view_s1_r5","colIndex":1,"rowIndex":4,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'region'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 10, 1, '{"rowId":"leads_view_s1_r6","colIndex":0,"rowIndex":5,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'lead_code'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 11, 1, '{"rowId":"leads_view_s1_r6","colIndex":1,"rowIndex":5,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'stage'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 12, 1, '{"rowId":"leads_view_s2_r1","colIndex":0,"rowIndex":6,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'cskh_history'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 13, 1, '{"rowId":"leads_view_s2_r2","colIndex":0,"rowIndex":7,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'customer_classification'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 14, 1, '{"rowId":"leads_view_s2_r2","colIndex":1,"rowIndex":7,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'cskh_note'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 15, 1, '{"rowId":"leads_view_s3_r1","colIndex":0,"rowIndex":8,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'tvbh_history'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 16, 1, '{"rowId":"leads_view_s3_r2","colIndex":0,"rowIndex":9,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'sales_outcome'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 17, 1, '{"rowId":"leads_view_s3_r2","colIndex":1,"rowIndex":9,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'assigned_user_id'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 18, 1, '{"rowId":"leads_view_s3_r3","colIndex":0,"rowIndex":10,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'tvbh_note'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);
INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT @lead_view_id, fd.id, 19, 1, '{"rowId":"leads_view_s3_r3","colIndex":1,"rowIndex":10,"colSpan":1}'
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'assigned_department'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = @lead_view_id AND ff.field_id = fd.id);

-- ============ View Bang Lead (usage table) ============
INSERT INTO views (entity, name, description, status, `usage`, is_locked)
SELECT 'leads', 'Bảng Lead', 'Bảng danh sách Lead MKT', 'active', 'table', 1
WHERE NOT EXISTS (SELECT 1 FROM views WHERE entity = 'leads' AND `usage` = 'table' AND name = 'Bảng Lead');
SET @lead_view_tbl = (SELECT id FROM views WHERE entity = 'leads' AND `usage` = 'table' AND name = 'Bảng Lead' LIMIT 1);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 0, 1, 110, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'lead_code'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 1, 1, 160, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'full_name'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 2, 1, 130, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'province'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 3, 1, 130, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'ward'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 4, 1, 120, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'phone'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 5, 1, 160, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'email'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 6, 1, 200, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'address'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 7, 1, 130, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'customer_type'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 8, 1, 180, 1, 0, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'note'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 9, 1, 120, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'source'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 10, 1, 110, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'stage'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 11, 1, 130, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'customer_classification'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable, config)
SELECT @lead_view_tbl, fd.id, 12, 1, 140, 1, 1, NULL
FROM field_definitions fd WHERE fd.entity = 'leads' AND fd.`key` = 'assigned_user_id'
AND NOT EXISTS (SELECT 1 FROM view_fields vf WHERE vf.view_id = @lead_view_tbl AND vf.field_id = fd.id);
