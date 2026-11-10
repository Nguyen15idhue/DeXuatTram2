DROP PROCEDURE IF EXISTS migrate_lead_consultation;
DELIMITER $$
CREATE PROCEDURE migrate_lead_consultation()
BEGIN
  DECLARE finished INT DEFAULT 0;
  DECLARE column_key VARCHAR(64);
  DECLARE column_ddl TEXT;
  DECLARE columns_cursor CURSOR FOR
    SELECT 'consultation_status', 'VARCHAR(32) NULL' UNION ALL
    SELECT 'first_contact_started_at', 'DATETIME NULL' UNION ALL
    SELECT 'first_contact_deadline_at', 'DATETIME NULL' UNION ALL
    SELECT 'first_contact_at', 'DATETIME NULL' UNION ALL
    SELECT 'consultation_calendar_id', 'INT NULL' UNION ALL
    SELECT 'consultation_round', 'INT UNSIGNED NOT NULL DEFAULT 0';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;
  OPEN columns_cursor;
  columns_loop: LOOP
    FETCH columns_cursor INTO column_key, column_ddl;
    IF finished = 1 THEN LEAVE columns_loop; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = column_key
    ) THEN
      SET @lead_column_sql = CONCAT('ALTER TABLE leads ADD COLUMN `', column_key, '` ', column_ddl);
      PREPARE lead_column_stmt FROM @lead_column_sql;
      EXECUTE lead_column_stmt;
      DEALLOCATE PREPARE lead_column_stmt;
    END IF;
  END LOOP;
  CLOSE columns_cursor;
END$$
DELIMITER ;
CALL migrate_lead_consultation();
DROP PROCEDURE migrate_lead_consultation;

CREATE TABLE IF NOT EXISTS lead_consultation_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  consultation_round INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lead_consultation_notice (lead_id, consultation_round),
  CONSTRAINT fk_lead_consultation_notice_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO field_definitions (entity, `key`, label, type, source_type, required, options, status)
SELECT 'leads', 'consultation_status', 'Trạng thái', 'select', 'fixed', 0,
  '[{"value":"WAITING_ALLOCATION","label":"Chờ GĐTTKD phân bổ","color":"#64748b"},{"value":"WAITING_FIRST_CONTACT","label":"Chờ GĐKV tư vấn lần đầu","color":"#eab308"},{"value":"CONSULTING","label":"GĐKV đang tư vấn","color":"#3b82f6"},{"value":"SUCCESS","label":"Đã tư vấn thành công","color":"#22c55e"},{"value":"FAILED","label":"Đã tư vấn thất bại","color":"#ef4444"}]',
  'active'
WHERE NOT EXISTS (SELECT 1 FROM field_definitions WHERE entity = 'leads' AND `key` = 'consultation_status');

UPDATE view_fields vf
JOIN views v ON v.id = vf.view_id AND v.entity = 'leads'
JOIN field_definitions old_field ON old_field.id = vf.field_id AND old_field.`key` = 'stage'
JOIN field_definitions new_field ON new_field.entity = 'leads' AND new_field.`key` = 'consultation_status'
SET vf.field_id = new_field.id
WHERE NOT EXISTS (SELECT 1 FROM (SELECT view_id, field_id FROM view_fields) current_fields
  WHERE current_fields.view_id = vf.view_id AND current_fields.field_id = new_field.id);
