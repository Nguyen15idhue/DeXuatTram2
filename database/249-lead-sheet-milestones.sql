DROP PROCEDURE IF EXISTS migrate_lead_sheet_milestones;
DELIMITER $$
CREATE PROCEDURE migrate_lead_sheet_milestones()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'sales_outcome_at') THEN
    ALTER TABLE leads ADD COLUMN sales_outcome_at TIMESTAMP NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'lead_assignments' AND COLUMN_NAME = 'assigned_by_rank') THEN
    ALTER TABLE lead_assignments ADD COLUMN assigned_by_rank VARCHAR(12) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'lead_assignments' AND COLUMN_NAME = 'assignee_rank') THEN
    ALTER TABLE lead_assignments ADD COLUMN assignee_rank VARCHAR(12) NULL;
  END IF;
END$$
DELIMITER ;
CALL migrate_lead_sheet_milestones();
DROP PROCEDURE migrate_lead_sheet_milestones;

DROP TRIGGER IF EXISTS trg_lead_sales_outcome_insert;
CREATE TRIGGER trg_lead_sales_outcome_insert BEFORE INSERT ON leads FOR EACH ROW
  SET NEW.sales_outcome_at = IF(NEW.sales_outcome IN ('SUCCESS', 'FAILED'), CURRENT_TIMESTAMP, NULL);

DROP TRIGGER IF EXISTS trg_lead_sales_outcome_update;
CREATE TRIGGER trg_lead_sales_outcome_update BEFORE UPDATE ON leads FOR EACH ROW
  SET NEW.sales_outcome_at = CASE
    WHEN NEW.sales_outcome IS NULL OR NEW.sales_outcome NOT IN ('SUCCESS', 'FAILED') THEN NULL
    WHEN NOT (NEW.sales_outcome <=> OLD.sales_outcome) THEN CURRENT_TIMESTAMP
    ELSE NEW.sales_outcome_at
  END;

UPDATE leads l
JOIN (
  SELECT entity_id, journey_id, created_at, outcome
  FROM (
    SELECT entity_id, journey_id, created_at,
      JSON_UNQUOTE(JSON_EXTRACT(changed_fields, '$.sales_outcome.to')) AS outcome,
      ROW_NUMBER() OVER (PARTITION BY journey_id, entity_id ORDER BY created_at DESC, id DESC) AS seq
    FROM journey_activity_logs
    WHERE entity_type = 'lead'
      AND JSON_CONTAINS_PATH(changed_fields, 'all', '$.sales_outcome.from', '$.sales_outcome.to')
      AND NOT (JSON_EXTRACT(changed_fields, '$.sales_outcome.from') <=> JSON_EXTRACT(changed_fields, '$.sales_outcome.to'))
  ) events
  WHERE seq = 1
) history ON history.entity_id = l.id AND history.journey_id = l.journey_id
SET l.sales_outcome_at = history.created_at, l.updated_at = l.updated_at
WHERE l.sales_outcome_at IS NULL AND l.deleted_at IS NULL
  AND l.sales_outcome IN ('SUCCESS', 'FAILED') AND l.sales_outcome = history.outcome
  AND history.created_at >= l.created_at;
