-- 221-proposal-signature-anchor-token.sql
-- Thêm anchor_token cho chữ ký trôi theo nội dung; làm nullable các cột vị trí cứng.
SET @has_anchor_token := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_signature_configs' AND COLUMN_NAME = 'anchor_token'
);
SET @sql_anchor_token := IF(@has_anchor_token = 0,
  'ALTER TABLE proposal_signature_configs ADD COLUMN anchor_token VARCHAR(64) NULL COMMENT ''Token anchor trong mẫu BCĐX ({sig_1}...)'' AFTER signer_title',
  'SELECT ''cot proposal_signature_configs.anchor_token da ton tai'' AS info');
PREPARE stmt_anchor_token FROM @sql_anchor_token;
EXECUTE stmt_anchor_token;
DEALLOCATE PREPARE stmt_anchor_token;

-- Make position columns nullable (allow anchor-based configs without absolute positions)
ALTER TABLE proposal_signature_configs MODIFY COLUMN page INT NULL DEFAULT NULL;
ALTER TABLE proposal_signature_configs MODIFY COLUMN pos_x DECIMAL(7,5) NULL DEFAULT NULL;
ALTER TABLE proposal_signature_configs MODIFY COLUMN pos_y DECIMAL(7,5) NULL DEFAULT NULL;
ALTER TABLE proposal_signature_configs MODIFY COLUMN box_width DECIMAL(7,5) NULL DEFAULT 0.30;
ALTER TABLE proposal_signature_configs MODIFY COLUMN box_height DECIMAL(7,5) NULL DEFAULT 0.08;
