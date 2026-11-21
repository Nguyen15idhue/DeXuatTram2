DROP PROCEDURE IF EXISTS migrate_lead_first_consultation;
DELIMITER $$
CREATE PROCEDURE migrate_lead_first_consultation()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'first_tvbh_entry_at') THEN
    ALTER TABLE leads ADD COLUMN first_tvbh_entry_at TIMESTAMP NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'tvbh_history_seen') THEN
    ALTER TABLE leads ADD COLUMN tvbh_history_seen TINYINT(1) NOT NULL DEFAULT 0;
  END IF;
END$$
DELIMITER ;
CALL migrate_lead_first_consultation();
DROP PROCEDURE migrate_lead_first_consultation;

DROP TRIGGER IF EXISTS trg_lead_first_tvbh_insert;
DROP TRIGGER IF EXISTS trg_lead_first_tvbh_update;

UPDATE leads l
JOIN (
  SELECT journey_id, entity_id, created_at, before_rows, after_rows
  FROM (
    SELECT journey_id, entity_id, created_at,
      JSON_EXTRACT(changed_fields, '$.tvbh_history.from') AS before_rows,
      JSON_EXTRACT(changed_fields, '$.tvbh_history.to') AS after_rows,
      ROW_NUMBER() OVER (PARTITION BY journey_id, entity_id ORDER BY created_at, id) AS seq
    FROM journey_activity_logs
    WHERE entity_type = 'lead'
      AND ((JSON_TYPE(JSON_EXTRACT(changed_fields, '$.tvbh_history.from')) = 'ARRAY'
          AND JSON_LENGTH(changed_fields, '$.tvbh_history.from') > 0)
        OR (JSON_TYPE(JSON_EXTRACT(changed_fields, '$.tvbh_history.to')) = 'ARRAY'
          AND JSON_LENGTH(changed_fields, '$.tvbh_history.to') > 0))
  ) events
  WHERE seq = 1
) history ON history.entity_id = l.id AND history.journey_id = l.journey_id
SET l.first_tvbh_entry_at = CASE
      WHEN (JSON_TYPE(history.before_rows) = 'NULL'
          OR (JSON_TYPE(history.before_rows) = 'ARRAY' AND JSON_LENGTH(history.before_rows) = 0))
        AND JSON_TYPE(history.after_rows) = 'ARRAY' AND JSON_LENGTH(history.after_rows) > 0
        AND history.created_at >= l.created_at
        AND (l.first_contact_at IS NULL OR UNIX_TIMESTAMP(l.first_contact_at) >= UNIX_TIMESTAMP(history.created_at))
      THEN history.created_at ELSE NULL END,
    l.tvbh_history_seen = 1, l.updated_at = l.updated_at
WHERE l.tvbh_history_seen = 0;

UPDATE leads
SET tvbh_history_seen = 1, updated_at = updated_at
WHERE tvbh_history_seen = 0 AND (first_contact_at IS NOT NULL OR (
  JSON_TYPE(JSON_EXTRACT(custom_data, '$.tvbh_history')) = 'ARRAY'
  AND JSON_LENGTH(custom_data, '$.tvbh_history') > 0
));

CREATE TRIGGER trg_lead_first_tvbh_insert BEFORE INSERT ON leads FOR EACH ROW
  SET NEW.tvbh_history_seen = IF(JSON_TYPE(JSON_EXTRACT(NEW.custom_data, '$.tvbh_history')) = 'ARRAY'
      AND JSON_LENGTH(NEW.custom_data, '$.tvbh_history') > 0, 1, 0),
    NEW.first_tvbh_entry_at = IF(NEW.tvbh_history_seen = 1, CURRENT_TIMESTAMP, NULL);

DELIMITER $$
CREATE TRIGGER trg_lead_first_tvbh_update BEFORE UPDATE ON leads FOR EACH ROW
BEGIN
  IF OLD.tvbh_history_seen = 0 AND OLD.first_contact_at IS NULL
    AND NOT COALESCE(JSON_TYPE(JSON_EXTRACT(OLD.custom_data, '$.tvbh_history')) = 'ARRAY'
      AND JSON_LENGTH(OLD.custom_data, '$.tvbh_history') > 0, FALSE)
    AND JSON_TYPE(JSON_EXTRACT(NEW.custom_data, '$.tvbh_history')) = 'ARRAY'
    AND JSON_LENGTH(NEW.custom_data, '$.tvbh_history') > 0 THEN
    SET NEW.first_tvbh_entry_at = CURRENT_TIMESTAMP;
    SET NEW.tvbh_history_seen = 1;
  ELSE
    SET NEW.first_tvbh_entry_at = OLD.first_tvbh_entry_at;
    SET NEW.tvbh_history_seen = OLD.tvbh_history_seen;
  END IF;
END$$
DELIMITER ;
