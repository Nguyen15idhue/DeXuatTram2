-- Script 37: Seed API Configs cho 1Office
-- Ngày: 09/09/2026
-- Mục tiêu: Seed 1 config 1Office, chạy lại không duplicate

-- Seed 1Office config (chỉ insert nếu chưa có)
INSERT INTO api_configs (name, base_url, auth_type, auth_config, description, is_active, created_by)
SELECT '1office', 'https://egr.1office.vn', 'token',
  '{"token":"18867666386a9fc351066cb292544194"}',
  '1Office CRM API - Quản lý liên hệ',
  1,
  (SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM api_configs WHERE name = '1office');

-- Seed default field mappings (Proposal → 1Office Contact)
SET @config_id = (SELECT id FROM api_configs WHERE name = '1office' LIMIT 1);

INSERT INTO api_field_mappings (api_config_id, source_field, target_field, target_field_type, sync_enabled, direction)
SELECT @config_id, 'owner_name', 'name', 'text', 1, 'both'
FROM DUAL WHERE @config_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM api_field_mappings WHERE api_config_id = @config_id AND source_field = 'owner_name');

INSERT INTO api_field_mappings (api_config_id, source_field, target_field, target_field_type, sync_enabled, direction)
SELECT @config_id, 'owner_phone', 'phone', 'phone', 1, 'both'
FROM DUAL WHERE @config_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM api_field_mappings WHERE api_config_id = @config_id AND source_field = 'owner_phone');

INSERT INTO api_field_mappings (api_config_id, source_field, target_field, target_field_type, sync_enabled, direction)
SELECT @config_id, 'address', 'address', 'text', 1, 'both'
FROM DUAL WHERE @config_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM api_field_mappings WHERE api_config_id = @config_id AND source_field = 'address');

INSERT INTO api_field_mappings (api_config_id, source_field, target_field, target_field_type, sync_enabled, direction)
SELECT @config_id, 'description', 'description', 'textarea', 1, 'push'
FROM DUAL WHERE @config_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM api_field_mappings WHERE api_config_id = @config_id AND source_field = 'description');

-- Verify
SELECT 'api_configs' AS tbl, id, name, base_url, is_active FROM api_configs WHERE name = '1office';
SELECT 'api_field_mappings' AS tbl, id, source_field, target_field, sync_enabled FROM api_field_mappings WHERE api_config_id = @config_id;
