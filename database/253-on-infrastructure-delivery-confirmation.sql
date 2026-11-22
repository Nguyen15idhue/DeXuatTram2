CREATE TABLE IF NOT EXISTS charging_station_infra_legacy_snapshot (
  charging_station_id INT NOT NULL PRIMARY KEY
) ENGINE=InnoDB;

START TRANSACTION;
INSERT IGNORE INTO charging_station_infra_legacy_snapshot (charging_station_id) VALUES (0);
SET @capture_existing_shipments := ROW_COUNT();
INSERT IGNORE INTO charging_station_infra_legacy_snapshot (charging_station_id)
SELECT DISTINCT charging_station_id
FROM warehouse_exports
WHERE @capture_existing_shipments = 1
  AND destination_type = 'STATION'
  AND charging_station_id IS NOT NULL;
COMMIT;

SET @columns_sql = (
  SELECT GROUP_CONCAT(definition SEPARATOR ', ')
  FROM (
    SELECT 'infra_delivery_confirmation' AS name, 'ADD COLUMN infra_delivery_confirmation ENUM(''NOT_CONFIRMED'',''CONFIRMED'') NOT NULL DEFAULT ''NOT_CONFIRMED''' AS definition
    UNION ALL SELECT 'infra_delivery_confirmation_note', 'ADD COLUMN infra_delivery_confirmation_note TEXT NULL'
    UNION ALL SELECT 'infra_delivery_confirmation_by', 'ADD COLUMN infra_delivery_confirmation_by INT NULL'
    UNION ALL SELECT 'infra_delivery_confirmation_at', 'ADD COLUMN infra_delivery_confirmation_at DATETIME NULL'
    UNION ALL SELECT 'infra_delivery_confirmation_model', 'ADD COLUMN infra_delivery_confirmation_model VARCHAR(32) NULL'
    UNION ALL SELECT 'infra_delivery_legacy_exempt', 'ADD COLUMN infra_delivery_legacy_exempt TINYINT(1) NOT NULL DEFAULT 0'
    UNION ALL SELECT 'expected_on_days', 'ADD COLUMN expected_on_days INT UNSIGNED NULL'
  ) additions
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = 'charging_stations'
      AND c.COLUMN_NAME = additions.name
  )
);
SET @sql = IF(@columns_sql IS NULL, 'SELECT 1', CONCAT('ALTER TABLE charging_stations ', @columns_sql));
PREPARE infra_delivery_stmt FROM @sql;
EXECUTE infra_delivery_stmt;
DEALLOCATE PREPARE infra_delivery_stmt;

UPDATE charging_stations cs
JOIN charging_station_infra_legacy_snapshot snapshot ON snapshot.charging_station_id = cs.id
SET cs.infra_delivery_legacy_exempt = 1
WHERE cs.infra_delivery_legacy_exempt = 0;

DROP TRIGGER IF EXISTS trg_on_infra_confirmation_model_change;
DELIMITER $$
CREATE TRIGGER trg_on_infra_confirmation_model_change
AFTER UPDATE ON station_proposals
FOR EACH ROW
BEGIN
  IF NOT (JSON_EXTRACT(OLD.custom_data, '$.mo_hinh_dau_tu') <=> JSON_EXTRACT(NEW.custom_data, '$.mo_hinh_dau_tu')) THEN
    INSERT INTO charging_station_activity_logs (charging_station_id, action, changed_fields, reject_reason, source)
    SELECT id, 'infrastructure_confirmation_changed',
      JSON_OBJECT('infra_delivery_confirmation', JSON_OBJECT('label', 'Xác nhận điều kiện đi trụ', 'old', 'CONFIRMED', 'new', 'NOT_CONFIRMED')),
      'Mô hình đầu tư thay đổi', 'system_auto'
    FROM charging_stations
    WHERE proposal_id = NEW.id AND infra_delivery_confirmation = 'CONFIRMED';
    UPDATE charging_stations
      SET infra_delivery_confirmation = 'NOT_CONFIRMED', infra_delivery_confirmation_by = NULL,
          infra_delivery_confirmation_at = NULL, infra_delivery_confirmation_model = NULL
      WHERE proposal_id = NEW.id AND infra_delivery_confirmation = 'CONFIRMED';
  END IF;
END$$
DELIMITER ;
