-- 107: Mo bai viet + chuyen muc chung cho vai tro guest (trang huong dan + chatbot khach)
-- Muc dich: cac bai/chuyen muc da mo cho ca 5 role (SUPER_ADMIN/ADMIN/SALES/CTV/NPP)
-- thi khach vang lai (guest) cung xem duoc. Bai han che (thieu 1 trong 5 role) giu nguyen.
-- Can cu: AGENTS.md "CTV/NPP/guest chi nhan bai help"; nut chat hien o /de-xuat (guest).
-- Idempotent: chi UPDATE dong chua co 'guest' (chay lai 0 dong).

UPDATE help_articles
SET roles = JSON_ARRAY_APPEND(roles, '$', 'guest')
WHERE status = 'published'
  AND roles IS NOT NULL
  AND JSON_CONTAINS(roles, '"SUPER_ADMIN"')
  AND JSON_CONTAINS(roles, '"ADMIN"')
  AND JSON_CONTAINS(roles, '"SALES"')
  AND JSON_CONTAINS(roles, '"CTV"')
  AND JSON_CONTAINS(roles, '"NPP"')
  AND NOT JSON_CONTAINS(roles, '"guest"');

UPDATE help_categories
SET visible_roles = JSON_ARRAY_APPEND(visible_roles, '$', 'guest')
WHERE visible_roles IS NOT NULL
  AND JSON_CONTAINS(visible_roles, '"SUPER_ADMIN"')
  AND JSON_CONTAINS(visible_roles, '"ADMIN"')
  AND JSON_CONTAINS(visible_roles, '"SALES"')
  AND JSON_CONTAINS(visible_roles, '"CTV"')
  AND JSON_CONTAINS(visible_roles, '"NPP"')
  AND NOT JSON_CONTAINS(visible_roles, '"guest"');
