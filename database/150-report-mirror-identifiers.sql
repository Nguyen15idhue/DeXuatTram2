-- 150: Cot dinh danh cho guong 1Office phuc vu bao cao (G5 Z-P1, docs/8/69-Z).
-- Giu UNIQUE uq_snap (automation_id, version, process_id); KHONG them FK (guong co the doi mapping).
-- Backfill bang service reportMirrorService (doc cells_json theo mapping), khong backfill bang SQL.
-- Idempotent: chi them cot/index neu chua co. KHONG dung DROP.

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'automation_sync_snapshots' AND column_name = 'proposal_code');
SET @s := IF(@c = 0,
  'ALTER TABLE automation_sync_snapshots ADD COLUMN proposal_code VARCHAR(50) NULL AFTER process_id, ADD COLUMN contact_code VARCHAR(50) NULL AFTER proposal_code, ADD COLUMN station_code VARCHAR(50) NULL AFTER contact_code',
  'SELECT ''mirror identifiers exist'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @i1 := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'automation_sync_snapshots' AND index_name = 'idx_snap_proposal');
SET @s1 := IF(@i1 = 0,
  'ALTER TABLE automation_sync_snapshots ADD INDEX idx_snap_proposal (automation_id, proposal_code)',
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

SET @i2 := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'automation_sync_snapshots' AND index_name = 'idx_snap_station');
SET @s2 := IF(@i2 = 0,
  'ALTER TABLE automation_sync_snapshots ADD INDEX idx_snap_station (automation_id, station_code)',
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

SELECT COUNT(*) AS snapshots FROM automation_sync_snapshots;
