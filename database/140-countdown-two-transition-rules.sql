-- 140: Chinh sach countdown MUC (ke hoach 72).
-- Chi giu 2 countdown LOAI "chuyen trang thai": PENDING = 3 ngay, APPROVED = 15 ngay.
-- Tat toan bo countdown "bo sung thong tin" + bo countdown Duyet chu truong (15 ngay cu).
-- Day la CHINH SACH MOI ghi de moi chinh sua truoc do o panel Countdown (co y).
-- Giu nguyen warn_hours hien co; idempotent (chay lai khong doi du lieu).

-- 1) Sua dong JSON hong (neu co) ve gia tri mach day du
UPDATE proposal_lifecycle_configs
   SET `value` = '{"warn_hours":24,"rules":[{"status":"PENDING","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":true,"days":3,"hours":0,"minutes":0}},{"status":"REVIEWING","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":false,"days":0,"hours":0,"minutes":0}},{"status":"PRINCIPLE_APPROVED","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":false,"days":0,"hours":0,"minutes":0}},{"status":"APPROVED","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":true,"days":15,"hours":0,"minutes":0}},{"status":"ARCHIVED","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":false,"days":0,"hours":0,"minutes":0}}]}'
 WHERE `key` = 'supplement_countdown_config'
   AND (`value` IS NULL OR NOT JSON_VALID(`value`));

-- 2) Ghi de rules, giu nguyen warn_hours
UPDATE proposal_lifecycle_configs
   SET `value` = JSON_SET(`value`, '$.rules', CAST('[{"status":"PENDING","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":true,"days":3,"hours":0,"minutes":0}},{"status":"REVIEWING","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":false,"days":0,"hours":0,"minutes":0}},{"status":"PRINCIPLE_APPROVED","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":false,"days":0,"hours":0,"minutes":0}},{"status":"APPROVED","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":true,"days":15,"hours":0,"minutes":0}},{"status":"ARCHIVED","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":false,"days":0,"hours":0,"minutes":0}}]' AS JSON)),
       updated_at = CURRENT_TIMESTAMP
 WHERE `key` = 'supplement_countdown_config'
   AND JSON_VALID(`value`);

-- 3) Chua co dong config -> them moi
INSERT INTO proposal_lifecycle_configs (`key`, `value`)
SELECT 'supplement_countdown_config',
       '{"warn_hours":24,"rules":[{"status":"PENDING","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":true,"days":3,"hours":0,"minutes":0}},{"status":"REVIEWING","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":false,"days":0,"hours":0,"minutes":0}},{"status":"PRINCIPLE_APPROVED","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":false,"days":0,"hours":0,"minutes":0}},{"status":"APPROVED","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":true,"days":15,"hours":0,"minutes":0}},{"status":"ARCHIVED","supplement":{"enabled":false,"days":0,"hours":0,"minutes":0},"transition":{"enabled":false,"days":0,"hours":0,"minutes":0}}]}'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM proposal_lifecycle_configs WHERE `key` = 'supplement_countdown_config');

SELECT 'countdown_rules' AS metric, `value` FROM proposal_lifecycle_configs WHERE `key` = 'supplement_countdown_config';
