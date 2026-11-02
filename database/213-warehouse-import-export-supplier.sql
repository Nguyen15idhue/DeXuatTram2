-- 213: Them supplier_id vao chi tiet nhap/xuat kho.
-- Idempotent.

SET @has_import_supplier := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_import_items' AND COLUMN_NAME = 'supplier_id'
);
SET @sql_import_supplier := IF(@has_import_supplier = 0,
  'ALTER TABLE warehouse_import_items ADD COLUMN supplier_id INT NULL AFTER import_id',
  'SELECT ''warehouse_import_items.supplier_id da ton tai'' AS info'
);
PREPARE stmt_import_supplier FROM @sql_import_supplier;
EXECUTE stmt_import_supplier;
DEALLOCATE PREPARE stmt_import_supplier;

SET @has_export_supplier := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items' AND COLUMN_NAME = 'supplier_id'
);
SET @sql_export_supplier := IF(@has_export_supplier = 0,
  'ALTER TABLE warehouse_export_items ADD COLUMN supplier_id INT NULL AFTER export_id',
  'SELECT ''warehouse_export_items.supplier_id da ton tai'' AS info'
);
PREPARE stmt_export_supplier FROM @sql_export_supplier;
EXECUTE stmt_export_supplier;
DEALLOCATE PREPARE stmt_export_supplier;

-- Backfill supplier_id tu charging_poles.supplier (neu cot con ton tai)
SET @has_supplier_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_poles' AND COLUMN_NAME = 'supplier'
);
SET @backfill_import_supplier := IF(@has_supplier_col = 0,
  'SELECT ''charging_poles.supplier da bi xoa, bo qua backfill import supplier'' AS info',
  'UPDATE warehouse_import_items wii JOIN charging_poles cp ON cp.id = wii.pole_id JOIN suppliers s ON s.name = TRIM(cp.supplier) SET wii.supplier_id = s.id WHERE wii.supplier_id IS NULL'
);
PREPARE stmt_backfill_import_supplier FROM @backfill_import_supplier;
EXECUTE stmt_backfill_import_supplier;
DEALLOCATE PREPARE stmt_backfill_import_supplier;

SET @backfill_export_supplier := IF(@has_supplier_col = 0,
  'SELECT ''charging_poles.supplier da bi xoa, bo qua backfill export supplier'' AS info',
  'UPDATE warehouse_export_items wei JOIN charging_poles cp ON cp.id = wei.pole_id JOIN suppliers s ON s.name = TRIM(cp.supplier) SET wei.supplier_id = s.id WHERE wei.supplier_id IS NULL'
);
PREPARE stmt_backfill_export_supplier FROM @backfill_export_supplier;
EXECUTE stmt_backfill_export_supplier;
DEALLOCATE PREPARE stmt_backfill_export_supplier;

-- Khoa ngoai import
SET @fk_import_supplier_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_import_items' AND CONSTRAINT_NAME = 'fk_wii_supplier'
);
SET @fk_import_supplier_sql := IF(@fk_import_supplier_exists = 0,
  'ALTER TABLE warehouse_import_items ADD CONSTRAINT fk_wii_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT',
  'SELECT ''fk_wii_supplier da ton tai'' AS info'
);
PREPARE stmt_fk_import_supplier FROM @fk_import_supplier_sql;
EXECUTE stmt_fk_import_supplier;
DEALLOCATE PREPARE stmt_fk_import_supplier;

-- Khoa ngoai export
SET @fk_export_supplier_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_export_items' AND CONSTRAINT_NAME = 'fk_wei_supplier'
);
SET @fk_export_supplier_sql := IF(@fk_export_supplier_exists = 0,
  'ALTER TABLE warehouse_export_items ADD CONSTRAINT fk_wei_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT',
  'SELECT ''fk_wei_supplier da ton tai'' AS info'
);
PREPARE stmt_fk_export_supplier FROM @fk_export_supplier_sql;
EXECUTE stmt_fk_export_supplier;
DEALLOCATE PREPARE stmt_fk_export_supplier;
