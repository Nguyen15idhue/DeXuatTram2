-- Thêm cột data_list_column vào field_definitions
ALTER TABLE field_definitions
  ADD COLUMN data_list_column VARCHAR(100) DEFAULT NULL COMMENT 'Column key trong data list, dùng cho cascading' AFTER data_list_id;
