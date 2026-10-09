-- 156: Link de xuat dung {base_url} thay vi hard-code localhost.
-- computePostFormulas da thay placeholder truoc khi evaluate (truoc day luu
-- nguyen van '{base_url}/...'). Base URL lay tu env FRONTEND_URL (.env prod
-- dat https://tmtegreen.io.vn; dev fallback http://localhost:5173).
-- Chi doi khi expression dang la ban literal cu -> idempotent, khong de len
-- sua tay khac.

UPDATE field_definitions
SET formula_config = JSON_SET(
  formula_config,
  '$.expression',
  'CONCAT(''{base_url}/admin/proposals/view='', id)'
)
WHERE entity = 'station_proposals'
  AND `key` = 'link_de_xuat'
  AND JSON_UNQUOTE(JSON_EXTRACT(formula_config, '$.expression')) = 'CONCAT(''http://localhost:5173/admin/proposals/view='', id)';
