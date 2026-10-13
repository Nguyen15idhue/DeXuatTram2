-- 99: Backfill han bo sung cho de xuat cu (tao truoc B5) chua co deadline
-- Idempotent (guard supplement_deadline_at IS NULL).

UPDATE station_proposals
SET supplement_deadline_at = DATE_ADD(created_at, INTERVAL 7 DAY)
WHERE supplement_deadline_at IS NULL
  AND status IN ('PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED');
