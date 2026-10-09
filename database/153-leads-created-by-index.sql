-- 153: Index cho scope MKT (leads.created_by) + tinh chỉnh index lọc theo thời gian (Issue P3 #11, docs/8/69-A.6).
-- Scope MKT loc `l.created_by = ?` va sort theo created_at → index (created_by, created_at).
-- Idempotent: guard information_schema.statistics. KHONG dung DROP.

SET @i := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'leads' AND index_name = 'idx_leads_created_by_created');
SET @s := IF(@i = 0,
  'ALTER TABLE leads ADD INDEX idx_leads_created_by_created (created_by, created_at)',
  'SELECT ''idx_leads_created_by_created exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT COUNT(*) AS leads FROM leads;
