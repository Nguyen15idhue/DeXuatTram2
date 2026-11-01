-- 201: ON tram - tach trang thai coc/thanh toan, buoc "Dang cau hinh", han 15 ngay tung hang muc
-- va phong ban Tai chinh. Idempotent, chi tien toi.

SET @status_type = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'status'
);
SET @sql = IF(
  @status_type NOT LIKE '%CONFIGURING%',
  'ALTER TABLE charging_stations MODIFY COLUMN status ENUM(''ONBOARDING'',''DELIVERING'',''INSTALLING'',''ACCEPTANCE'',''CONFIGURING'',''OPERATING'') NOT NULL DEFAULT ''ONBOARDING''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sub_status_type = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'sub_status'
);
SET @sql = IF(
  @sub_status_type NOT LIKE '%NOT_CONFIGURED%',
  'ALTER TABLE charging_stations MODIFY COLUMN sub_status ENUM(''NOT_DELIVERED'',''DELIVERING'',''DELIVERED'',''NOT_INSTALLED'',''INSTALLING'',''INSTALLED'',''NOT_ACCEPTED'',''ACCEPT_FAILED'',''ACCEPT_PASSED'',''NOT_CONFIGURED'',''CONFIGURING'',''ACTIVE'') NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @payment_type = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'payment_status'
);
SET @sql = IF(
  @payment_type NOT LIKE '%NOT_REQUIRED%',
  'ALTER TABLE charging_stations MODIFY COLUMN payment_status ENUM(''NOT'',''DOING'',''DONE'',''NOT_REQUIRED'') NULL DEFAULT ''NOT''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'deposit_status'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE charging_stations ADD COLUMN deposit_status ENUM(''NOT_REQUIRED'',''NOT_RECEIVED'',''RECEIVED'',''REFUND_PENDING'',''REFUNDED'') NOT NULL DEFAULT ''NOT_RECEIVED'' AFTER payment_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'contract_deadline_at'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE charging_stations ADD COLUMN contract_deadline_at DATETIME NULL AFTER deposit_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'infra_deadline_at'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE charging_stations ADD COLUMN infra_deadline_at DATETIME NULL AFTER contract_deadline_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charging_stations' AND COLUMN_NAME = 'finance_deadline_at'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE charging_stations ADD COLUMN finance_deadline_at DATETIME NULL AFTER infra_deadline_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE charging_stations
   SET status = 'CONFIGURING', sub_status = 'NOT_CONFIGURED'
 WHERE status = 'OPERATING' AND sub_status = 'CONFIGURING';

UPDATE charging_stations cs
  JOIN station_proposals p ON p.id = cs.proposal_id
   SET cs.deposit_status = 'NOT_REQUIRED', cs.payment_status = 'NOT_REQUIRED'
 WHERE UPPER(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.mo_hinh_dau_tu'))) = 'TDT'
   AND NOT EXISTS (SELECT 1 FROM charging_station_invoices i WHERE i.charging_station_id = cs.id);

UPDATE charging_stations cs
  JOIN (
    SELECT charging_station_id,
           SUM(CASE WHEN invoice_type = 'DEPOSIT' THEN amount ELSE 0 END) AS deposit_total,
           SUM(CASE WHEN invoice_type = 'REFUND' THEN amount ELSE 0 END) AS refund_total
      FROM charging_station_invoices
     GROUP BY charging_station_id
  ) s ON s.charging_station_id = cs.id
   SET cs.deposit_status = CASE
         WHEN s.deposit_total > 0 AND s.refund_total >= s.deposit_total THEN 'REFUNDED'
         WHEN s.deposit_total > 0 THEN 'RECEIVED'
         ELSE cs.deposit_status
       END
 WHERE cs.deposit_status = 'NOT_RECEIVED';

UPDATE charging_stations
   SET contract_deadline_at = DATE_ADD(created_at, INTERVAL 15 DAY),
       infra_deadline_at = DATE_ADD(created_at, INTERVAL 15 DAY),
       finance_deadline_at = CASE
         WHEN deposit_status = 'NOT_REQUIRED' AND payment_status = 'NOT_REQUIRED' THEN NULL
         ELSE DATE_ADD(created_at, INTERVAL 15 DAY)
       END
 WHERE contract_deadline_at IS NULL;

UPDATE field_definitions
   SET options = JSON_ARRAY_APPEND(COALESCE(options, JSON_ARRAY()), '$', JSON_OBJECT(
     'value', 'Phòng Tài chính',
     'label', 'Phòng Tài chính',
     'color', '#059669',
     'borderRadius', 'rounded'
   )),
       updated_at = NOW()
 WHERE entity = 'users'
   AND `key` = 'department'
   AND JSON_SEARCH(options, 'one', 'Phòng Tài chính', NULL, '$[*].value') IS NULL;

UPDATE field_definitions
   SET options = JSON_ARRAY_APPEND(COALESCE(options, JSON_ARRAY()), '$', JSON_OBJECT(
     'value', 'Trưởng phòng Tài chính',
     'label', 'Trưởng phòng Tài chính',
     'color', '#059669',
     'borderRadius', 'rounded'
   )),
       updated_at = NOW()
 WHERE entity = 'users'
   AND `key` = 'chuc_vu'
   AND JSON_SEARCH(options, 'one', 'Trưởng phòng Tài chính', NULL, '$[*].value') IS NULL;

UPDATE field_definitions
   SET options = JSON_ARRAY_APPEND(COALESCE(options, JSON_ARRAY()), '$', JSON_OBJECT(
     'value', 'Chuyên viên Tài chính',
     'label', 'Chuyên viên Tài chính',
     'color', '#10b981',
     'borderRadius', 'rounded'
   )),
       updated_at = NOW()
 WHERE entity = 'users'
   AND `key` = 'chuc_vu'
   AND JSON_SEARCH(options, 'one', 'Chuyên viên Tài chính', NULL, '$[*].value') IS NULL;
