-- 113: Lịch sử bố cục template báo cáo BCĐX (docs/8/58 - Bố cục Word)
-- Mỗi lần sửa bố cục lưu 1 phiên bản (file .docx + mapping) để rollback.
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS `document_template_versions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `template_id` int NOT NULL,
  `file_id` int DEFAULT NULL COMMENT 'FK files: bản .docx của phiên bản',
  `mapping` json DEFAULT NULL COMMENT 'mapping tại thời điểm snapshot',
  `label` varchar(255) DEFAULT NULL COMMENT 'Mô tả thao tác (Chèn/Xóa/Căn...)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dtv_template` (`template_id`,`created_at`),
  CONSTRAINT `fk_dtv_template` FOREIGN KEY (`template_id`) REFERENCES `document_templates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dtv_file` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
