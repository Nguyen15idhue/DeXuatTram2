-- 215 fix: replace old line uniqueness with supplier-aware uniqueness.
SET @has_idx_i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_import_items' AND INDEX_NAME='idx_warehouse_import_id');
SET @sql_i := IF(@has_idx_i=0, 'ALTER TABLE warehouse_import_items ADD INDEX idx_warehouse_import_id (import_id)', 'SELECT 1');
PREPARE i FROM @sql_i; EXECUTE i; DEALLOCATE PREPARE i;
SET @has_old_i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_import_items' AND INDEX_NAME='uq_warehouse_import_items');
SET @sql_old_i := IF(@has_old_i>0, 'ALTER TABLE warehouse_import_items DROP INDEX uq_warehouse_import_items', 'SELECT 1');
PREPARE j FROM @sql_old_i; EXECUTE j; DEALLOCATE PREPARE j;
SET @has_new_i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_import_items' AND INDEX_NAME='uq_warehouse_import_items_supplier');
SET @sql_new_i := IF(@has_new_i=0, 'ALTER TABLE warehouse_import_items ADD UNIQUE KEY uq_warehouse_import_items_supplier (import_id, supplier_id, pole_id)', 'SELECT 1');
PREPARE k FROM @sql_new_i; EXECUTE k; DEALLOCATE PREPARE k;
SET @has_idx_e := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_export_items' AND INDEX_NAME='idx_warehouse_export_id');
SET @sql_e := IF(@has_idx_e=0, 'ALTER TABLE warehouse_export_items ADD INDEX idx_warehouse_export_id (export_id)', 'SELECT 1');
PREPARE l FROM @sql_e; EXECUTE l; DEALLOCATE PREPARE l;
SET @has_old_e := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_export_items' AND INDEX_NAME='uq_warehouse_export_items');
SET @sql_old_e := IF(@has_old_e>0, 'ALTER TABLE warehouse_export_items DROP INDEX uq_warehouse_export_items', 'SELECT 1');
PREPARE m FROM @sql_old_e; EXECUTE m; DEALLOCATE PREPARE m;
SET @has_new_e := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_export_items' AND INDEX_NAME='uq_warehouse_export_items_supplier');
SET @sql_new_e := IF(@has_new_e=0, 'ALTER TABLE warehouse_export_items ADD UNIQUE KEY uq_warehouse_export_items_supplier (export_id, supplier_id, pole_id)', 'SELECT 1');
PREPARE n FROM @sql_new_e; EXECUTE n; DEALLOCATE PREPARE n;
