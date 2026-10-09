-- 155: bo sung cot bat buoc + routing vao view Excel import cua Lead (neu co).
-- View exact (include_rest=0) chi import dung cot trong view; view 'Import leads'
-- tren dev thieu province (bat buoc o BE) nen file co du lieu van bi danh loi.
-- Tim view dich DONG (excel_basic + exact cua entity leads) thay vi hard-code id
-- (id view do UI tao, khac nhau giua cac moi truong; VPS khong co view nay thi
-- import dung view table include_rest=1 da du cot -> no-op, khong loi FK).
-- Idempotent.

SET @leads_import_view = (
  SELECT v.id FROM views v
  WHERE v.entity = 'leads' AND v.usage LIKE 'excel%' AND v.include_rest = 0
  ORDER BY v.id LIMIT 1
);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT @leads_import_view, fd.id, 3, 1, 160, 0, 1 FROM field_definitions fd
WHERE @leads_import_view IS NOT NULL
  AND fd.entity = 'leads' AND fd.`key` = 'province'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = @leads_import_view AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT @leads_import_view, fd.id, 4, 1, 160, 0, 1 FROM field_definitions fd
WHERE @leads_import_view IS NOT NULL
  AND fd.entity = 'leads' AND fd.`key` = 'ward'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = @leads_import_view AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT @leads_import_view, fd.id, 5, 1, 150, 0, 1 FROM field_definitions fd
WHERE @leads_import_view IS NOT NULL
  AND fd.entity = 'leads' AND fd.`key` = 'customer_type'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = @leads_import_view AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT @leads_import_view, fd.id, 6, 1, 150, 0, 1 FROM field_definitions fd
WHERE @leads_import_view IS NOT NULL
  AND fd.entity = 'leads' AND fd.`key` = 'source'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = @leads_import_view AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT @leads_import_view, fd.id, 7, 1, 160, 0, 1 FROM field_definitions fd
WHERE @leads_import_view IS NOT NULL
  AND fd.entity = 'leads' AND fd.`key` = 'customer_classification'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = @leads_import_view AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT @leads_import_view, fd.id, 8, 1, 200, 0, 1 FROM field_definitions fd
WHERE @leads_import_view IS NOT NULL
  AND fd.entity = 'leads' AND fd.`key` = 'address'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = @leads_import_view AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT @leads_import_view, fd.id, 9, 1, 200, 0, 1 FROM field_definitions fd
WHERE @leads_import_view IS NOT NULL
  AND fd.entity = 'leads' AND fd.`key` = 'note'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = @leads_import_view AND field_id = fd.id);
