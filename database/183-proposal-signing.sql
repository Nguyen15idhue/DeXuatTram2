-- 183: Buoc trinh ky (SIGNATURE_PENDING -> COMPLETED)
-- - station_proposals.signed_file_id: file BCĐX đã ký chốt (chủ tịch duyệt) -> trạng thái COMPLETED
-- - proposal_signature_configs.signature_id / signature_url: chữ ký số đã áp dụng cho ô ký
-- Idempotent: chay lai nhieu lan khong loi, khong nhan doi du lieu.

-- ============ 1. Cot signed_file_id tren station_proposals ============
SET @has_signed_file := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'signed_file_id'
);
SET @sql_signed_file := IF(@has_signed_file = 0,
  'ALTER TABLE station_proposals ADD COLUMN signed_file_id INT NULL COMMENT ''File BCĐX đã ký chốt (chủ tịch phê duyệt)'' AFTER tong_gia_tri_chot',
  'SELECT ''cot station_proposals.signed_file_id da ton tai'' AS info');
PREPARE stmt_signed_file FROM @sql_signed_file;
EXECUTE stmt_signed_file;
DEALLOCATE PREPARE stmt_signed_file;

-- ============ 2. Cot signature_id / signature_url tren proposal_signature_configs ============
SET @has_signature_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_signature_configs' AND COLUMN_NAME = 'signature_id'
);
SET @sql_signature_id := IF(@has_signature_id = 0,
  'ALTER TABLE proposal_signature_configs ADD COLUMN signature_id INT NULL COMMENT ''Chữ ký số đã áp dụng (signatures.id)'' AFTER signer_title',
  'SELECT ''cot proposal_signature_configs.signature_id da ton tai'' AS info');
PREPARE stmt_signature_id FROM @sql_signature_id;
EXECUTE stmt_signature_id;
DEALLOCATE PREPARE stmt_signature_id;

SET @has_signature_url := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_signature_configs' AND COLUMN_NAME = 'signature_url'
);
SET @sql_signature_url := IF(@has_signature_url = 0,
  'ALTER TABLE proposal_signature_configs ADD COLUMN signature_url VARCHAR(500) NULL COMMENT ''Đường dẫn ảnh chữ ký đã áp dụng'' AFTER signature_id',
  'SELECT ''cot proposal_signature_configs.signature_url da ton tai'' AS info');
PREPARE stmt_signature_url FROM @sql_signature_url;
EXECUTE stmt_signature_url;
DEALLOCATE PREPARE stmt_signature_url;
