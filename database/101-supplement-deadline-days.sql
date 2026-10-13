-- 101: Doi moc thoi gian bo sung thong tin
-- - PENDING / REVIEWING (review_supplement_days): 7 -> 3 ngay
-- - PRINCIPLE_APPROVED (principle_supplement_days): 7 -> 15 ngay
-- Doi voi de xuat dang o cac trang thai nay, tinh lai moc tu updated_at
-- (lan cap nhat/vao trang thai gan nhat). Idempotent.

UPDATE proposal_lifecycle_configs SET `value` = '3' WHERE `key` = 'review_supplement_days';
UPDATE proposal_lifecycle_configs SET `value` = '15' WHERE `key` = 'principle_supplement_days';

UPDATE station_proposals
SET supplement_deadline_at = DATE_ADD(updated_at, INTERVAL 3 DAY)
WHERE status IN ('PENDING', 'REVIEWING');

UPDATE station_proposals
SET supplement_deadline_at = DATE_ADD(updated_at, INTERVAL 15 DAY)
WHERE status = 'PRINCIPLE_APPROVED';
