-- 216: Mo rong noi nhan phieu xuat kho.
SET @has_type := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_exports' AND COLUMN_NAME='destination_type');
SET @sql_type := IF(@has_type=0, 'ALTER TABLE warehouse_exports ADD COLUMN destination_type ENUM(''STATION'',''WAREHOUSE'',''PROJECT'',''OTHER'') NOT NULL DEFAULT ''STATION'' AFTER charging_station_id', 'SELECT 1');
PREPARE a FROM @sql_type; EXECUTE a; DEALLOCATE PREPARE a;
SET @has_name := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_exports' AND COLUMN_NAME='destination_name');
SET @sql_name := IF(@has_name=0, 'ALTER TABLE warehouse_exports ADD COLUMN destination_name VARCHAR(255) NULL AFTER destination_type', 'SELECT 1');
PREPARE b FROM @sql_name; EXECUTE b; DEALLOCATE PREPARE b;
SET @has_address := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_exports' AND COLUMN_NAME='destination_address');
SET @sql_address := IF(@has_address=0, 'ALTER TABLE warehouse_exports ADD COLUMN destination_address TEXT NULL AFTER destination_name', 'SELECT 1');
PREPARE c FROM @sql_address; EXECUTE c; DEALLOCATE PREPARE c;
SET @has_note := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='warehouse_exports' AND COLUMN_NAME='destination_note');
SET @sql_note := IF(@has_note=0, 'ALTER TABLE warehouse_exports ADD COLUMN destination_note TEXT NULL AFTER destination_address', 'SELECT 1');
PREPARE d FROM @sql_note; EXECUTE d; DEALLOCATE PREPARE d;
ALTER TABLE warehouse_exports MODIFY COLUMN charging_station_id INT NULL;
