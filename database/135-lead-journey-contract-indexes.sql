-- 135: Reconcile indexes required by the MKT database contract.
-- Rollback: drop only indexes added by this migration, if any.
-- Idempotent. Migration 134 already provides these indexes in this database.

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'leads'
     AND index_name = 'idx_leads_created') = 0,
  'ALTER TABLE leads ADD INDEX idx_leads_created (created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'leads'
     AND index_name = 'idx_leads_stage_created') = 0,
  'ALTER TABLE leads ADD INDEX idx_leads_stage_created (stage, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'leads'
     AND index_name = 'idx_leads_classification_created') = 0,
  'ALTER TABLE leads ADD INDEX idx_leads_classification_created (customer_classification, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'leads'
     AND index_name = 'idx_leads_source_created') = 0,
  'ALTER TABLE leads ADD INDEX idx_leads_source_created (source, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'leads'
     AND index_name = 'idx_leads_province_created') = 0,
  'ALTER TABLE leads ADD INDEX idx_leads_province_created (province, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'leads'
     AND index_name = 'idx_leads_assigned_created') = 0,
  'ALTER TABLE leads ADD INDEX idx_leads_assigned_created (assigned_user_id, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'leads'
     AND index_name = 'idx_leads_phone') = 0,
  'ALTER TABLE leads ADD INDEX idx_leads_phone (phone)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'business_journeys'
     AND column_name = 'journey_code') = 0,
  'ALTER TABLE business_journeys ADD INDEX idx_business_journeys_code (journey_code)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
