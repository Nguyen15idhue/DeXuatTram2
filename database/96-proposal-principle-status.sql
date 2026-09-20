-- 96: Them status PRINCIPLE_APPROVED (Duyet chu truong) cho de xuat
-- Ma tran: REVIEWING -> PRINCIPLE_APPROVED; PRINCIPLE_APPROVED -> APPROVED | CANCELLED
-- 1. Mo rong enum station_proposals.status: 8 -> 9
-- 2. Append option PRINCIPLE_APPROVED vao field_definitions (giu nguyen icon/mau admin da tuy chinh)
-- 3. Don sort_order: APPROVED 3->4, CANCELLED 4->5, ARCHIVED 5->6, REJECTED 6->7,
--    CONTRACT_SIGNED 7->8, CONTRACT_FAILED 8->9

-- ============ 1. ENUM 9 gia tri (guard information_schema) ============
SET @has_principle := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'status'
    AND COLUMN_TYPE LIKE '%PRINCIPLE_APPROVED%'
);
SET @sql_enum := IF(@has_principle = 0,
'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(''PENDING'',''REVIEWING'',''PRINCIPLE_APPROVED'',''APPROVED'',''REJECTED'',''CANCELLED'',''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'') NULL DEFAULT ''PENDING''',
'SELECT ''enum station_proposals.status already has PRINCIPLE_APPROVED'' AS info');
PREPARE stmt_enum FROM @sql_enum;
EXECUTE stmt_enum;
DEALLOCATE PREPARE stmt_enum;

-- ============ 2. Append option PRINCIPLE_APPROVED (guard NOT JSON_CONTAINS) ============
UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT('value','PRINCIPLE_APPROVED','label','Duyệt chủ trương','color','#6366f1','borderRadius','rounded','icon','flag','show_in_legend',1,'sort_order',3))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND NOT JSON_CONTAINS(options, JSON_OBJECT('value','PRINCIPLE_APPROVED'), '$');

-- ============ 3. Don sort_order 6 muc cu (chi chay khi dang dung gia tri cu) ============
UPDATE field_definitions
SET options = JSON_REPLACE(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'APPROVED', NULL, '$[*].value')), '.value', ''), '.sort_order'), 4)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'APPROVED', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'APPROVED', NULL, '$[*].value')), '.value', ''), '.sort_order')) = 3;

UPDATE field_definitions
SET options = JSON_REPLACE(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CANCELLED', NULL, '$[*].value')), '.value', ''), '.sort_order'), 5)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CANCELLED', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CANCELLED', NULL, '$[*].value')), '.value', ''), '.sort_order')) = 4;

UPDATE field_definitions
SET options = JSON_REPLACE(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'ARCHIVED', NULL, '$[*].value')), '.value', ''), '.sort_order'), 6)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'ARCHIVED', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'ARCHIVED', NULL, '$[*].value')), '.value', ''), '.sort_order')) = 5;

UPDATE field_definitions
SET options = JSON_REPLACE(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'REJECTED', NULL, '$[*].value')), '.value', ''), '.sort_order'), 7)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'REJECTED', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'REJECTED', NULL, '$[*].value')), '.value', ''), '.sort_order')) = 6;

UPDATE field_definitions
SET options = JSON_REPLACE(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_SIGNED', NULL, '$[*].value')), '.value', ''), '.sort_order'), 8)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_SIGNED', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_SIGNED', NULL, '$[*].value')), '.value', ''), '.sort_order')) = 7;

UPDATE field_definitions
SET options = JSON_REPLACE(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_FAILED', NULL, '$[*].value')), '.value', ''), '.sort_order'), 9)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_FAILED', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'CONTRACT_FAILED', NULL, '$[*].value')), '.value', ''), '.sort_order')) = 8;
