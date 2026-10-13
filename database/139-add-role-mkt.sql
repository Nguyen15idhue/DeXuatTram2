-- 139: Add MKT role (step 2.1, sprint S2 of docs/8/69).
-- Contract: docs/8/mkt/04-permission-contract.md (role additions) + 00-business-decisions.md
-- - users.role: extend ENUM with MKT (keeps NULL DEFAULT 'CTV')
-- - field_definitions.options of users.role: add the Marketing option
-- MKT does not join the users.parent_id tree; only the option/enum change happens here.
-- Rollback: ALTER back to the 5-value ENUM after no MKT user remains; drop the last option entry.
-- Idempotent, no DROP.

ALTER TABLE users
  MODIFY COLUMN role ENUM('SUPER_ADMIN','ADMIN','SALES','CTV','NPP','MKT') NULL DEFAULT 'CTV';

UPDATE field_definitions
   SET options = '[{"color": "#dc2626", "label": "SUPER_ADMIN", "value": "SUPER_ADMIN", "borderRadius": "rounded"}, {"color": "#7c3aed", "label": "ADMIN", "value": "ADMIN", "borderRadius": "rounded"}, {"color": "#2563eb", "label": "SALES", "value": "SALES", "borderRadius": "rounded"}, {"color": "#666666", "label": "CTV", "value": "CTV", "borderRadius": "rounded"}, {"color": "#0ea5e9", "label": "Nhà phân phối", "value": "NPP", "borderRadius": "rounded"}, {"color": "#f59e0b", "label": "Marketing", "value": "MKT", "borderRadius": "rounded"}]'
 WHERE entity = 'users' AND `key` = 'role';

SELECT 'users_role_enum' AS metric, column_type FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role';

SELECT 'role_options' AS metric, options FROM field_definitions
 WHERE entity = 'users' AND `key` = 'role';
