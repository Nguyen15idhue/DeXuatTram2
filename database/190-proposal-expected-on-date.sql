SET @expected_on_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'station_proposals'
    AND COLUMN_NAME = 'ngay_du_kien_on'
);
SET @expected_on_column_sql := IF(
  @expected_on_column_exists = 0,
  'ALTER TABLE station_proposals ADD COLUMN ngay_du_kien_on DATE NULL AFTER tong_gia_tri_chot',
  'SELECT ''station_proposals.ngay_du_kien_on already exists'' AS info'
);
PREPARE stmt_expected_on_column FROM @expected_on_column_sql;
EXECUTE stmt_expected_on_column;
DEALLOCATE PREPARE stmt_expected_on_column;
