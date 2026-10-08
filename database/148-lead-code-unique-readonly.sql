-- 146: lead_code — dam bao duy nhat + read-only + backfill gia tri thieu.
-- Giu dinh dang tuan tu LD-%06d (sinh tu insertId khi tao Lead).
-- - Backfill lead_code NULL bang LD-%06d theo id (on dinh, duy nhat).
-- - Them UNIQUE index uq_leads_lead_code (chi khi khong con trung lap).
-- - Dat field_definitions.source_config.readonly = true cho leads.lead_code (form khong sua duoc).
-- Idempotent.

-- 1. Backfill gia tri NULL (tuan tu theo id)
UPDATE leads
SET lead_code = CONCAT('LD-', LPAD(id, 6, '0'))
WHERE lead_code IS NULL OR lead_code = '';

-- 2. Them UNIQUE index neu chua co va khong con trung lap
SET @dup = (SELECT COUNT(*) FROM (SELECT lead_code FROM leads GROUP BY lead_code HAVING COUNT(*) > 1) t);
SET @has_uq = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'leads' AND index_name = 'uq_leads_lead_code');
SET @sql = IF(@dup = 0 AND @has_uq = 0,
  'ALTER TABLE leads ADD UNIQUE INDEX uq_leads_lead_code (lead_code)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Field read-only (khong sua duoc tren form)
UPDATE field_definitions
SET source_config = JSON_SET(IFNULL(source_config, JSON_OBJECT()), '$.readonly', TRUE)
WHERE entity = 'leads' AND `key` = 'lead_code';
