-- 212: Hien de xuat DEPLOYING/ACTIVE tren ban do
-- Icon + mau marker lay dong tu cau hinh TRAM (frontend resolve qua entity 'station'),
-- migration nay chi mo legend/chip filter cho 2 trang thai:
--   DEPLOYING: show_in_legend 0 -> 1, sort_order 20.5 -> 4.5 (cuoi "Da duyet BCDX")
--   ACTIVE:    show_in_legend 0 -> 1, sort_order 20   -> 4.7
-- Khi icon (construction/evStation) tren field de xuat giu nguyen cho form/bang de xuat.

-- ============ DEPLOYING (chi chay khi co phan tu chua cac gia tri cu) ============
UPDATE field_definitions
SET options = JSON_SET(options,
  CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'DEPLOYING', NULL, '$[*].value')), '.value', ''), '.show_in_legend'), 1,
  CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'DEPLOYING', NULL, '$[*].value')), '.value', ''), '.sort_order'), 4.5)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'DEPLOYING', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'DEPLOYING', NULL, '$[*].value')), '.value', ''), '.show_in_legend')) IN (0, 1, '0', '1')
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'DEPLOYING', NULL, '$[*].value')), '.value', ''), '.sort_order')) IN (20.5, '20.5', 21, '21');

-- ============ ACTIVE ============
UPDATE field_definitions
SET options = JSON_SET(options,
  CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'ACTIVE', NULL, '$[*].value')), '.value', ''), '.show_in_legend'), 1,
  CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'ACTIVE', NULL, '$[*].value')), '.value', ''), '.sort_order'), 4.7)
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'ACTIVE', NULL, '$[*].value')) IS NOT NULL
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'ACTIVE', NULL, '$[*].value')), '.value', ''), '.show_in_legend')) IN (0, 1, '0', '1')
  AND JSON_EXTRACT(options, CONCAT(REPLACE(JSON_UNQUOTE(JSON_SEARCH(options, 'one', 'ACTIVE', NULL, '$[*].value')), '.value', ''), '.sort_order')) IN (20, '20');
