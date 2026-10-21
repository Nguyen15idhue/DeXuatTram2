-- 173-signatures-table.sql
-- Bảng lưu chữ ký số (e-sign) của người dùng — module "Quản lý Chữ ký số"

CREATE TABLE IF NOT EXISTS `signatures` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL COMMENT 'Người sở hữu chữ ký (mỗi user chỉ có 1 chữ ký)',
  `file_path` VARCHAR(500) NOT NULL COMMENT 'Đường dẫn file vật lý trên server',
  `file_url` VARCHAR(500) NOT NULL COMMENT 'URL tương đối của file',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_signatures_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uk_signatures_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
