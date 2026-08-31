-- Bảng data_lists: Quản lý danh mục dữ liệu dùng chung
CREATE TABLE IF NOT EXISTS data_lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  columns_config JSON NOT NULL COMMENT 'Cấu trúc columns: [{key, label, type}]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Bảng data_list_rows: Dữ liệu dòng trong danh mục
CREATE TABLE IF NOT EXISTS data_list_rows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  list_id INT NOT NULL,
  data JSON NOT NULL COMMENT 'Dữ liệu dòng: {column_key: value}',
  parent_row_id INT DEFAULT NULL COMMENT 'Self-reference cho multi-level cascading',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (list_id) REFERENCES data_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_row_id) REFERENCES data_list_rows(id) ON DELETE SET NULL,
  INDEX idx_list_id (list_id),
  INDEX idx_parent_row_id (parent_row_id)
);
