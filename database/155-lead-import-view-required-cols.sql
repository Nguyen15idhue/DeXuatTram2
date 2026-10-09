-- 155: bo sung cot bat buoc + routing vao view 'Import leads' (leads, exact).
-- View exact (include_rest=0) chi import dung cot trong view; view dang thieu
-- province (bat buoc o BE) va cac cot can cho routing (classification) nen file
-- co du lieu van bi danh 'thieu Tinh/Thanh pho'. Them idempotent theo cap (view, field).
-- Idempotent.

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT 20, fd.id, 3, 1, 160, 0, 1 FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'province'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = 20 AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT 20, fd.id, 4, 1, 160, 0, 1 FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'ward'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = 20 AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT 20, fd.id, 5, 1, 150, 0, 1 FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'customer_type'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = 20 AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT 20, fd.id, 6, 1, 150, 0, 1 FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'source'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = 20 AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT 20, fd.id, 7, 1, 160, 0, 1 FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'customer_classification'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = 20 AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT 20, fd.id, 8, 1, 200, 0, 1 FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'address'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = 20 AND field_id = fd.id);

INSERT INTO view_fields (view_id, field_id, order_index, visible, width, sortable, filterable)
SELECT 20, fd.id, 9, 1, 200, 0, 1 FROM field_definitions fd
WHERE fd.entity = 'leads' AND fd.`key` = 'note'
  AND NOT EXISTS (SELECT 1 FROM view_fields WHERE view_id = 20 AND field_id = fd.id);
