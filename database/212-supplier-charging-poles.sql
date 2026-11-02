-- 212: Quan he nhieu-nhieu NCC - loai tru va ton kho theo cap NCC-loai tru.
-- Idempotent.

CREATE TABLE IF NOT EXISTS supplier_charging_poles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  charging_pole_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_supplier_pole (supplier_id, charging_pole_id),
  CONSTRAINT fk_scp_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_scp_pole FOREIGN KEY (charging_pole_id) REFERENCES charging_poles (id) ON DELETE RESTRICT,
  CONSTRAINT chk_scp_quantity CHECK (quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill supplier tu charging_poles.supplier (chi chay khi cot supplier con ton tai)
SET @has_supplier_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_poles' AND COLUMN_NAME = 'supplier'
);
SET @backfill_sql := IF(@has_supplier_col = 0,
  'SELECT ''charging_poles.supplier da bi xoa, bo qua backfill'' AS info',
  'INSERT INTO suppliers (name) SELECT DISTINCT TRIM(supplier) FROM charging_poles WHERE supplier IS NOT NULL AND TRIM(supplier) <> '''' ON DUPLICATE KEY UPDATE name = VALUES(name)'
);
PREPARE stmt_backfill_suppliers FROM @backfill_sql;
EXECUTE stmt_backfill_suppliers;
DEALLOCATE PREPARE stmt_backfill_suppliers;

SET @backfill_rel_sql := IF(@has_supplier_col = 0,
  'SELECT ''charging_poles.supplier da bi xoa, bo qua backfill relation'' AS info',
  'INSERT INTO supplier_charging_poles (supplier_id, charging_pole_id, quantity)
   SELECT s.id, cp.id, cp.quantity
   FROM charging_poles cp
   JOIN suppliers s ON s.name = TRIM(cp.supplier)
   ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)'
);
PREPARE stmt_backfill_rel FROM @backfill_rel_sql;
EXECUTE stmt_backfill_rel;
DEALLOCATE PREPARE stmt_backfill_rel;
