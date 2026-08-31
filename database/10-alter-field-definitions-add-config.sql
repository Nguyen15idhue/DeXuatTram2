-- Migration: Thêm config columns cho field_definitions
-- Ngày: 2026-08-31
-- Mục đích: Hỗ trợ cấu hình chi tiết cho từng loại field

ALTER TABLE field_definitions
  ADD COLUMN number_format VARCHAR(20) DEFAULT NULL COMMENT 'integer|float|currency' AFTER type,
  ADD COLUMN decimal_places INT DEFAULT NULL COMMENT 'So chu so thap phan' AFTER number_format,
  ADD COLUMN date_format VARCHAR(30) DEFAULT NULL COMMENT 'DD/MM/YYYY, YYYY-MM-DD, etc.' AFTER decimal_places,
  ADD COLUMN timezone VARCHAR(50) DEFAULT NULL COMMENT 'Mui gio' AFTER date_format,
  ADD COLUMN source_config JSON DEFAULT NULL COMMENT 'Cau hinh data source cho select' AFTER options,
  ADD COLUMN parent_field VARCHAR(100) DEFAULT NULL COMMENT 'Field key của parent cho cascading' AFTER source_config,
  ADD COLUMN option_style JSON DEFAULT NULL COMMENT 'Style cho options: color, borderRadius' AFTER parent_field,
  ADD COLUMN file_config JSON DEFAULT NULL COMMENT 'Cau hinh file: accept, maxSize, multiple' AFTER option_style,
  ADD COLUMN formula_config JSON DEFAULT NULL COMMENT 'Cau hinh formula: expression, referencedFields' AFTER file_config;
