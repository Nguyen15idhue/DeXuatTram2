-- 77: Them role Nha phan phoi (NPP) — quyen giong het CTV
-- - users.role: mo rong ENUM (giu NULL DEFAULT 'CTV' nhu hien tai)
-- - field_definitions.options cua users.role: them lua chon NPP
-- Idempotent, khong DROP.

ALTER TABLE users
  MODIFY COLUMN role ENUM('SUPER_ADMIN','ADMIN','SALES','CTV','NPP') NULL DEFAULT 'CTV';

UPDATE field_definitions
   SET options = '[{"color":"#dc2626","label":"SUPER_ADMIN","value":"SUPER_ADMIN","borderRadius":"rounded"},{"color":"#7c3aed","label":"ADMIN","value":"ADMIN","borderRadius":"rounded"},{"color":"#2563eb","label":"SALES","value":"SALES","borderRadius":"rounded"},{"color":"#666666","label":"CTV","value":"CTV","borderRadius":"rounded"},{"color":"#0ea5e9","label":"Nhà phân phối","value":"NPP","borderRadius":"rounded"}]'
 WHERE entity = 'users' AND `key` = 'role';

SELECT 'users_role_enum' AS metric, column_type FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role';

SELECT 'role_options' AS metric, options FROM field_definitions
 WHERE entity = 'users' AND `key` = 'role';
