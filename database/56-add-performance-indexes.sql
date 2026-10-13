-- Script 56: Them index tang toc cac truy van danh sach
-- Ngay: 13/09/2026
-- Muc tieu: tranh filesort khi ORDER BY created_at, va tang toc loc data_list_rows
-- Idempotent: chi them index neu chua co. KHONG dung DROP.

-- station_proposals (user_id, created_at)
SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND index_name = 'idx_proposals_user_created');
SET @s := IF(@c = 0,
  'ALTER TABLE station_proposals ADD INDEX idx_proposals_user_created (user_id, created_at)',
  'SELECT ''idx_proposals_user_created exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- station_proposals (status, created_at)
SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'station_proposals' AND index_name = 'idx_proposals_status_created');
SET @s := IF(@c = 0,
  'ALTER TABLE station_proposals ADD INDEX idx_proposals_status_created (status, created_at)',
  'SELECT ''idx_proposals_status_created exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- stations (created_at)
SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'stations' AND index_name = 'idx_stations_created');
SET @s := IF(@c = 0,
  'ALTER TABLE stations ADD INDEX idx_stations_created (created_at)',
  'SELECT ''idx_stations_created exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- data_list_rows (list_id, sort_order)
SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'data_list_rows' AND index_name = 'idx_dlr_list_sort');
SET @s := IF(@c = 0,
  'ALTER TABLE data_list_rows ADD INDEX idx_dlr_list_sort (list_id, sort_order)',
  'SELECT ''idx_dlr_list_sort exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Verify
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND index_name IN ('idx_proposals_user_created','idx_proposals_status_created','idx_stations_created','idx_dlr_list_sort')
GROUP BY TABLE_NAME, INDEX_NAME;
