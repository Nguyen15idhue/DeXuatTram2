-- Thêm cột relation_key vào field_definitions (trước đây là file 14-alter-field-definitions-add-relation-key.sql).
-- relation_key: column key trong data list chứa FK về parent field value
-- VD: Field "Huyện" có parent_field="tinh", relation_key="tinh"
-- Idempotent: chỉ thêm cột khi chưa tồn tại.

SET @has_relation_key := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'field_definitions'
    AND COLUMN_NAME = 'relation_key'
);
SET @relation_key_sql := IF(
  @has_relation_key = 0,
  'ALTER TABLE field_definitions ADD COLUMN relation_key VARCHAR(100) DEFAULT NULL COMMENT ''Column key trong data list chứa FK về parent field value'' AFTER data_list_column',
  'SELECT ''relation_key already exists'' AS info'
);
PREPARE stmt_relation_key FROM @relation_key_sql;
EXECUTE stmt_relation_key;
DEALLOCATE PREPARE stmt_relation_key;
