-- 124: Automation gan cong viec quy trinh vao du an (docs/8/66, Buoc 1)
-- Bang cau hinh automation + seed dong auto_assign_process (mac dinh TAT).
-- Idempotent.

CREATE TABLE IF NOT EXISTS work_automations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  automation_key VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  project_code VARCHAR(20) NOT NULL DEFAULT '2',
  project_title VARCHAR(255) NULL,
  retry_max INT NOT NULL DEFAULT 3,
  retry_interval_s INT NOT NULL DEFAULT 20,
  find_timeout_s INT NOT NULL DEFAULT 60,
  username VARCHAR(255) NULL,
  password_enc TEXT NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO work_automations (automation_key, name, enabled, project_code, project_title, retry_max, retry_interval_s, find_timeout_s, note) VALUES
  ('auto_assign_process', 'Tự động gán công việc quy trình vào dự án', 0, '2', 'Đánh giá đầu tư hạ tầng trạm sạc', 3, 20, 60, 'Tìm quy trình theo mã đề xuất sau khi duyệt & đẩy, gán vào dự án qua session web 1Office (giữ khối Liên quan)')
ON DUPLICATE KEY UPDATE name = VALUES(name);
