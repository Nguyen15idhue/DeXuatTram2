-- 71: required la nguon duy nhat theo field_definitions (Admin -> Fields)
-- Muc tieu:
--   1. Nha required cua toan bo field source_type='fixed' ve 0 (mac dinh optional).
--   2. Giu bat buoc he thong (invariant, code cung enforce): latitude/longitude (stations, station_proposals),
--      email/password (users).
--   3. Bo tang override theo form: form_fields.config.requiredOverride (chi dung required o /admin/fields).
-- Idempotent, KHONG DROP.

-- 1. Fixed -> optional
UPDATE field_definitions SET required = 0 WHERE source_type = 'fixed';

-- 2. Invariant luon bat buoc
--    (full_name cua users la rang buoc cau truc NOT NULL)
UPDATE field_definitions
   SET required = 1
 WHERE (entity IN ('stations', 'station_proposals') AND `key` IN ('latitude', 'longitude'))
    OR (entity = 'users' AND `key` IN ('email', 'password', 'full_name'));

-- 3. Bo requiredOverride khoi form_fields.config
UPDATE form_fields
   SET config = JSON_REMOVE(config, '$.requiredOverride')
 WHERE config IS NOT NULL
   AND JSON_EXTRACT(config, '$.requiredOverride') IS NOT NULL;

-- Verify
SELECT 'fixed_required' AS metric, COUNT(*) AS n FROM field_definitions WHERE source_type = 'fixed' AND required = 1;
SELECT 'requiredOverride_left' AS metric, COUNT(*) AS n FROM form_fields WHERE config IS NOT NULL AND JSON_EXTRACT(config, '$.requiredOverride') IS NOT NULL;
