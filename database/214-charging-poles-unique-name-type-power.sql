-- 214: Dam bao khong trung loai tru cung ten/loai/cong suat.
-- Idempotent.

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_poles' AND INDEX_NAME = 'uq_charging_poles_name_type_power'
);
SET @sql_idx := IF(@has_idx = 0,
  'ALTER TABLE charging_poles ADD UNIQUE INDEX uq_charging_poles_name_type_power (name, charging_type, power_kw)',
  'SELECT ''uq_charging_poles_name_type_power da ton tai'' AS info'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
