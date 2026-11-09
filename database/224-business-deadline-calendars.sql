SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND column_name = 'countdown_calendar_id') = 0,
  'ALTER TABLE station_proposals ADD COLUMN countdown_calendar_id INT NULL, ADD CONSTRAINT fk_proposal_countdown_calendar FOREIGN KEY (countdown_calendar_id) REFERENCES business_calendar_versions(id)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'charging_stations' AND column_name = 'countdown_calendar_id') = 0,
  'ALTER TABLE charging_stations ADD COLUMN countdown_calendar_id INT NULL, ADD CONSTRAINT fk_charging_countdown_calendar FOREIGN KEY (countdown_calendar_id) REFERENCES business_calendar_versions(id)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
