-- Thêm cột data_list_id vào field_definitions
-- NULL = dùng options thủ công (mặc định)
-- NOT NULL = tham chiếu data_lists
ALTER TABLE field_definitions
  ADD COLUMN data_list_id INT DEFAULT NULL COMMENT 'Tham chiếu data_lists.id. NULL=options thủ công' AFTER options,
  ADD FOREIGN KEY (data_list_id) REFERENCES data_lists(id) ON DELETE SET NULL;
