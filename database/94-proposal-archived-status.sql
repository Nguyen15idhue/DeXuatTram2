-- 94: Them status ARCHIVED (Da luu tru) cho de xuat
-- Ma tran: REVIEWING -> ARCHIVED; ARCHIVED -> CONTRACT_SIGNED | CANCELLED
-- 1. Mo rong enum station_proposals.status: 7 -> 8
-- 2. Append option ARCHIVED vao field_definitions (giu nguyen icon/mau admin da tuy chinh)
-- 3. Don sort_order: REJECTED 5->6, CONTRACT_SIGNED 6->7, CONTRACT_FAILED 7->8

-- ============ 1. ENUM 8 gia tri (guard information_schema) ============
SET @has_archived := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'status'
    AND COLUMN_TYPE LIKE '%ARCHIVED%'
);
SET @sql_enum := IF(@has_archived = 0,
'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(''PENDING'',''REVIEWING'',''APPROVED'',''REJECTED'',''CANCELLED'',''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'') NULL DEFAULT ''PENDING''',
'SELECT ''enum station_proposals.status already has ARCHIVED'' AS info');
PREPARE stmt_enum FROM @sql_enum;
EXECUTE stmt_enum;
DEALLOCATE PREPARE stmt_enum;

-- ============ 2. Append option ARCHIVED (guard NOT JSON_CONTAINS) ============
UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT('value','ARCHIVED','label','Đã lưu trữ','color','#8b5cf6','borderRadius','rounded','icon','pause','show_in_legend',1,'sort_order',5))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value','ARCHIVED'), '$');

-- ============ 3. Don sort_order 3 muc cu (chi chay khi dang dung gia tri cu) ============
UPDATE field_definitions
SET options = JSON_REPLACE(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'REJECTED', NULL, '$[*].value')), '.value', ''), '.sort_order'), 6)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'REJECTED', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'REJECTED', NULL, '$[*].value')), '.value', ''), '.sort_order')) = 5;

UPDATE field_definitions
SET options = JSON_REPLACE(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_SIGNED', NULL, '$[*].value')), '.value', ''), '.sort_order'), 7)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_SIGNED', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_SIGNED', NULL, '$[*].value')), '.value', ''), '.sort_order')) = 6;

UPDATE field_definitions
SET options = JSON_REPLACE(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_FAILED', NULL, '$[*].value')), '.value', ''), '.sort_order'), 8)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_FAILED', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_FAILED', NULL, '$[*].value')), '.value', ''), '.sort_order')) = 7;
