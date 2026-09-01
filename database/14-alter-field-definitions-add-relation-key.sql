-- Thêm cột relation_key vào field_definitions
-- relation_key: column key trong data list chứa FK về parent field value
-- VD: Field "Huyện" có parent_field="tinh", relation_key="tinh"
--   → Trong data list, column "tinh" chứa giá trị FK link về field "tinh"

ALTER TABLE field_definitions
  ADD COLUMN relation_key VARCHAR(100) DEFAULT NULL 
  COMMENT 'Column key trong data list chứa FK về parent field value' 
  AFTER data_list_column;
