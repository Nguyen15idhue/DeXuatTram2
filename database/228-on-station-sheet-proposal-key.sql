SET @has_sheet_key = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'on_station_sheet_sync_queue'
    AND COLUMN_NAME = 'sheet_proposal_code'
);
SET @add_sheet_key = IF(@has_sheet_key = 0,
  'ALTER TABLE on_station_sheet_sync_queue ADD COLUMN sheet_proposal_code VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt_sheet_key FROM @add_sheet_key;
EXECUTE stmt_sheet_key;
DEALLOCATE PREPARE stmt_sheet_key;

SET @has_sheet_cms = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'on_station_sheet_sync_queue'
    AND COLUMN_NAME = 'sheet_cms_code'
);
SET @add_sheet_cms = IF(@has_sheet_cms = 0,
  'ALTER TABLE on_station_sheet_sync_queue ADD COLUMN sheet_cms_code VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt_sheet_cms FROM @add_sheet_cms;
EXECUTE stmt_sheet_cms;
DEALLOCATE PREPARE stmt_sheet_cms;

UPDATE on_station_sheet_sync_queue q
JOIN station_proposals p ON p.id=q.proposal_id
LEFT JOIN charging_stations cs ON cs.proposal_id=p.id
SET q.sheet_proposal_code=COALESCE(NULLIF(p.ma_de_xuat_gen, ''), q.sheet_proposal_code),
    q.sheet_cms_code=COALESCE(NULLIF(cs.cms_station_code, ''), q.sheet_cms_code);

DROP TRIGGER IF EXISTS trg_on_station_sheet_key_before_delete;
DELIMITER $$
CREATE TRIGGER trg_on_station_sheet_key_before_delete
BEFORE DELETE ON station_proposals
FOR EACH ROW
BEGIN
  IF OLD.status = 'ACTIVE' OR EXISTS (
    SELECT 1 FROM on_station_sheet_sync_queue WHERE proposal_id=OLD.id
  ) THEN
    INSERT INTO on_station_sheet_sync_queue
      (proposal_id, operation, status, sheet_proposal_code, sheet_cms_code)
    VALUES (OLD.id, 'DELETE', 'PENDING', OLD.ma_de_xuat_gen,
      (SELECT cms_station_code FROM charging_stations WHERE proposal_id=OLD.id LIMIT 1))
    ON DUPLICATE KEY UPDATE
      sheet_proposal_code=COALESCE(NULLIF(OLD.ma_de_xuat_gen, ''), sheet_proposal_code),
      sheet_cms_code=COALESCE(VALUES(sheet_cms_code), sheet_cms_code);
  END IF;
END$$
DELIMITER ;
