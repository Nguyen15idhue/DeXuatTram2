-- 44-alter-field-mappings-target-unique.sql
-- Kế hoạch 29: cho phép 1 nguồn (source_field) -> nhiều đích (target_field),
-- mỗi đích chỉ thuộc 1 nguồn. Chạy 1 lần. KHÔNG đổi direction/sync_enabled row cũ.

-- 1. Bỏ unique theo source (nếu còn)
SET @idx_src := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_field_mappings'
    AND INDEX_NAME = 'uq_field_mappings_config_source');
SET @drop_src := IF(@idx_src > 0,
  'ALTER TABLE api_field_mappings DROP INDEX uq_field_mappings_config_source',
  'SELECT 1');
PREPARE stmt_drop_src FROM @drop_src;
EXECUTE stmt_drop_src;
DEALLOCATE PREPARE stmt_drop_src;

-- 2. Thêm unique theo target (nếu chưa có)
SET @idx_tgt := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_field_mappings'
    AND INDEX_NAME = 'uq_field_mappings_config_target');
SET @add_tgt := IF(@idx_tgt = 0,
  'ALTER TABLE api_field_mappings ADD UNIQUE KEY uq_field_mappings_config_target (api_config_id, target_field)',
  'SELECT 1');
PREPARE stmt_add_tgt FROM @add_tgt;
EXECUTE stmt_add_tgt;
DEALLOCATE PREPARE stmt_add_tgt;
