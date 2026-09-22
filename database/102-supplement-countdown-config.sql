-- 102: Cấu hình countdown bổ sung thông tin (gộp vào 1 key JSON)
-- Cho phép sửa thời gian + danh sách trạng thái áp dụng countdown trên UI thay vì hardcode.
-- Idempotent: chỉ thêm key nếu chưa có; giữ 2 key cũ làm fallback.

ALTER TABLE proposal_lifecycle_configs MODIFY COLUMN `value` TEXT NOT NULL;

INSERT INTO proposal_lifecycle_configs (`key`, `value`)
SELECT 'supplement_countdown_config', CONCAT(
  '{"warn_hours":24,"rules":[',
  '{"status":"PENDING","days":', COALESCE((SELECT `value` FROM proposal_lifecycle_configs WHERE `key` = 'review_supplement_days' LIMIT 1), '3'), ',"enabled":true},',
  '{"status":"REVIEWING","days":', COALESCE((SELECT `value` FROM proposal_lifecycle_configs WHERE `key` = 'review_supplement_days' LIMIT 1), '3'), ',"enabled":true},',
  '{"status":"PRINCIPLE_APPROVED","days":', COALESCE((SELECT `value` FROM proposal_lifecycle_configs WHERE `key` = 'principle_supplement_days' LIMIT 1), '15'), ',"enabled":true},',
  '{"status":"APPROVED","days":10,"enabled":false},',
  '{"status":"ARCHIVED","days":10,"enabled":false}',
  ']}'
)
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT `key` FROM proposal_lifecycle_configs) t WHERE t.`key` = 'supplement_countdown_config'
);
