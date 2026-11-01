-- Store each signer's department with the proposal signature configuration.
SET @signer_department_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'proposal_signature_configs'
    AND COLUMN_NAME = 'signer_department'
);
SET @signer_department_sql := IF(
  @signer_department_exists = 0,
  'ALTER TABLE proposal_signature_configs ADD COLUMN signer_department VARCHAR(150) NULL AFTER signer_title',
  'SELECT ''signer_department already exists'' AS info'
);
PREPARE stmt_signer_department FROM @signer_department_sql;
EXECUTE stmt_signer_department;
DEALLOCATE PREPARE stmt_signer_department;

UPDATE proposal_signature_configs AS config
JOIN users AS signer ON signer.id = config.user_id
SET config.signer_department = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(signer.custom_data, '$.department'))), '')
WHERE config.signer_department IS NULL;
