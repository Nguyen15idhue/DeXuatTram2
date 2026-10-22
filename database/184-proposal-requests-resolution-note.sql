-- 184: Ghi chú kết quả xử lý cho Yêu cầu đề xuất (tab "Đề xuất cần thực hiện")
-- - proposal_requests.resolution_note: ghi chú khi đánh dấu đã hoàn thành
-- Idempotent: chay lai nhieu lan khong loi.

SET @has_resolution_note := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_requests' AND COLUMN_NAME = 'resolution_note'
);
SET @sql_resolution_note := IF(@has_resolution_note = 0,
  'ALTER TABLE proposal_requests ADD COLUMN resolution_note TEXT NULL COMMENT ''Ghi chú kết quả khi đánh dấu đã hoàn thành'' AFTER note',
  'SELECT ''cot proposal_requests.resolution_note da ton tai'' AS info');
PREPARE stmt_resolution_note FROM @sql_resolution_note;
EXECUTE stmt_resolution_note;
DEALLOCATE PREPARE stmt_resolution_note;
