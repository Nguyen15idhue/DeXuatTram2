-- 220-proposal-bcduyet-generated-meta.sql
-- Lưu thông tin mẫu đã dùng để tạo BCĐX + thời điểm tạo.
SET @has_bc_dx_template_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'bc_dx_template_id'
);
SET @sql_bc_dx_template_id := IF(@has_bc_dx_template_id = 0,
  'ALTER TABLE station_proposals ADD COLUMN bc_dx_template_id INT NULL COMMENT ''Mẫu BCĐX đã dùng để tạo file'' AFTER signed_file_id',
  'SELECT ''cot station_proposals.bc_dx_template_id da ton tai'' AS info');
PREPARE stmt_bc_dx_template_id FROM @sql_bc_dx_template_id;
EXECUTE stmt_bc_dx_template_id;
DEALLOCATE PREPARE stmt_bc_dx_template_id;

SET @has_bc_dx_generated_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'bc_dx_generated_at'
);
SET @sql_bc_dx_generated_at := IF(@has_bc_dx_generated_at = 0,
  'ALTER TABLE station_proposals ADD COLUMN bc_dx_generated_at DATETIME NULL COMMENT ''Thời điểm tạo file BCĐX'' AFTER bc_dx_template_id',
  'SELECT ''cot station_proposals.bc_dx_generated_at da ton tai'' AS info');
PREPARE stmt_bc_dx_generated_at FROM @sql_bc_dx_generated_at;
EXECUTE stmt_bc_dx_generated_at;
DEALLOCATE PREPARE stmt_bc_dx_generated_at;
