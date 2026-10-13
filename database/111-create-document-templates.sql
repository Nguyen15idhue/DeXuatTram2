-- 111: Quản lý tài liệu báo cáo đề xuất (docs/8/58 - Phase 1)
-- Tạo bảng document_templates + document_constants và seed hằng số dùng chung.
-- Idempotent: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.

CREATE TABLE IF NOT EXISTS `document_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `entity` varchar(100) NOT NULL DEFAULT 'station_proposals',
  `model` varchar(20) DEFAULT NULL COMMENT 'TDT/NQ/LK (NULL = dùng chung)',
  `file_id` int DEFAULT NULL COMMENT 'FK files: file .docx mẫu',
  `mapping` json DEFAULT NULL COMMENT 'tokens/loops/footers/datalist/const',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_templates_entity_model` (`entity`,`model`),
  CONSTRAINT `fk_doc_templates_file` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `document_constants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(100) NOT NULL,
  `label` varchar(255) NOT NULL,
  `value` text,
  `group_name` varchar(100) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_doc_constants_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `document_constants` (`key`,`label`,`value`,`group_name`) VALUES
('company_name','Tên công ty','CÔNG TY CỔ PHẦN ĐẦU TƯ TRẠM SẠC VIỆT NAM','Chung'),
('company_short','Tên viết tắt','TMT-EGREEN','Chung'),
('plan_tdt','Kế hoạch trụ Tự đầu tư','486','Kế hoạch 6 tháng cuối năm 2026'),
('plan_lk','Kế hoạch trụ Liên kết','246','Kế hoạch 6 tháng cuối năm 2026'),
('plan_nq','Kế hoạch trụ Nhượng quyền','511','Kế hoạch 6 tháng cuối năm 2026'),
('plan_npp','Kế hoạch trụ NPP','478','Kế hoạch 6 tháng cuối năm 2026'),
('signer_ketoan','Người ký P.TCKT','Đỗ Mai Hương','Chữ ký'),
('signer_ketoan_dept','Đơn vị người ký P.TCKT','PHÒNG TCKT','Chữ ký'),
('signer_tgd_nq_lk','Tổng Giám đốc (mẫu NQ/LK)','Nguyễn Huy Phong','Chữ ký'),
('signer_tgd_tdt','Tổng Giám đốc (mẫu TDT)','Lê Hoàng Hải','Chữ ký');
