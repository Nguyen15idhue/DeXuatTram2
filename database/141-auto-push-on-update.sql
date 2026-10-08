-- 141: Tu dong tao lenh day 1Office khi luu de xuat (docs/8/71, phan A)
-- auto_push_on_update = 1 bat tat auto-push khi PUT /admin/proposals/:id va PUT /my-proposals/:id
-- So 140 da duoc ke hoach 72 dat cho 140-countdown-two-transition-rules.sql.
-- Idempotent.

INSERT INTO proposal_lifecycle_configs (`key`, `value`) VALUES
  ('auto_push_on_update', '1')
ON DUPLICATE KEY UPDATE `value` = `value`;
