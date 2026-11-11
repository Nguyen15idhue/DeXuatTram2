ALTER TABLE charging_station_commitments MODIFY supplier_id INT NULL;

SET @has_old_export_unique = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items'
    AND INDEX_NAME = 'uq_warehouse_export_items_supplier'
);
SET @sql = IF(@has_old_export_unique > 0,
  'ALTER TABLE warehouse_export_items DROP INDEX uq_warehouse_export_items_supplier',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_commitment_unique = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items'
    AND INDEX_NAME = 'uq_warehouse_export_supplier_commitment'
);
SET @sql = IF(@has_commitment_unique = 0,
  'ALTER TABLE warehouse_export_items ADD UNIQUE KEY uq_warehouse_export_supplier_commitment (export_id, supplier_id, pole_id, commitment_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
